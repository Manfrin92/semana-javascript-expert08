export default class VideoProcessor {
  #mp4Demuxer;
  #webMWriter;
  #buffers = [];
  #service;

  /**
   *
   * @param {object} options
   * @param {import('./mp4Demuxer.js').default} options.mp4Demuxer
   * @param {import('./../deps/webm-writer2.js').default} options.webMWriter
   * @param {import('./service.js').default} options.service
   */
  constructor({ mp4Demuxer, webMWriter, service }) {
    this.#mp4Demuxer = mp4Demuxer;
    this.#webMWriter = webMWriter;
    this.#service = service;
  }

  /**
   * @returns {ReadableStream}
   */
  mp4Decoder(stream) {
    return new ReadableStream({
      start: async (controller) => {
        const decoder = new VideoDecoder({
          /**
           *
           * @param {VideoFrame} frame
           */
          output(frame) {
            controller.enqueue(frame);
          },
          error(e) {
            console.error("error at video mp4Decoder ", e);
            controller.error(e);
          },
        });

        return this.#mp4Demuxer.run(stream, {
          async onConfig(config) {
            decoder.configure(config);
          },
          /**
           *
           * @param {EncodedVideoChunk} chunk
           */
          onChunk(chunk) {
            decoder.decode(chunk);
          },
        });
      },
    });
  }

  enconde144p(encodeConfig) {
    let _encoder;

    const readable = new ReadableStream({
      start: async (controller) => {
        const { supported } = await VideoEncoder.isConfigSupported(
          encodeConfig
        );

        if (!supported) {
          const errorMessage = `enconde144p VideoEncoder config not supported, ${config}`;
          console.error(errorMessage);
          controller.error(errorMessage);
          return;
        }

        _encoder = new VideoEncoder({
          /**
           *
           * @param {EncodedVideoChunk} chunkFrame
           * @param {EncodedVideoChunkMetadata} config
           */
          output: (chunkFrame, config) => {
            if (config.decoderConfig) {
              const decoderConfig = {
                type: "config",
                config: config.decoderConfig,
              };
              controller.enqueue(decoderConfig);
            }
            controller.enqueue(chunkFrame);
          },
          error: (err) => {
            console.error("VideoEncoder enconde144p ", err);
            controller.error(err);
          },
        });

        await _encoder.configure(encodeConfig);
      },
    });

    const writable = new WritableStream({
      async write(frame) {
        _encoder.encode(frame);
        frame.close();
      },
    });

    return {
      readable,
      writable,
    };
  }

  renderDecodedFramesAndGetEncodedChunks(renderFrame) {
    let _decoder;

    return new TransformStream({
      start(controller) {
        _decoder = new VideoDecoder({
          output(frame) {
            renderFrame(frame);
          },
          error(err) {
            console.error(err);
            controller.error(err);
          },
        });
      },
      /**
       *
       * @param {EncodedVideoChunk} encodedChunk
       * @param {TransformStreamDefaultController} controller
       */
      async transform(encodedChunk, controller) {
        if (encodedChunk.type === "config") {
          await _decoder.configure(encodedChunk.config);
          return;
        }

        _decoder.decode(encodedChunk);

        // need the encoded version to use webM
        controller.enqueue(encodedChunk);
      },
    });
  }

  transformIntoWebM() {
    const writable = new WritableStream({
      write: (chunk) => {
        this.#webMWriter.addFrame(chunk);
      },
    });

    return {
      readable: this.#webMWriter.getStream(),
      writable,
    };
  }

  upload(fileName, resolution, type) {
    let chunks = [];
    let byteCount = 0;
    let segmentCount = 0;

    const triggerUpload = async (chunks) => {
      const blob = new Blob(chunks, { type: "video/webm" });

      await this.#service.uploadFile({
        fileName: `${fileName}-${resolution}.${++segmentCount}.${type}`,
        fileBuffer: blob,
      });

      chunks.length = 0;
    };

    return new WritableStream({
      /**
       *
       * @param {object} options
       * @param {Uint8Array} options.data
       */
      async write({ data }) {
        chunks.push(data);
        byteCount += data.byteLength;

        if (byteCount <= 10e6) {
          return;
        }

        await triggerUpload(chunks);
        // renderFrame(frame);
      },
      async close() {
        if (!chunks.length) return;

        await triggerUpload(chunks);
      },
    });
  }

  async start({ file, encoderConfig, renderFrame, sendMessage }) {
    const stream = file.stream();
    const fileName = file.name.split("/").pop().replace(".mp4", "");

    // const pipeToBuffer = new TransformStream({
    //   transform: ({ data, position }, controller) => {
    //     this.#buffers.push(data);
    //     controller.enqueue(data);
    //   },
    //   flush: () => {
    //     sendMessage({
    //       status: "done",
    //     });
    //   },
    // });

    await this.mp4Decoder(stream)
      .pipeThrough(this.enconde144p(encoderConfig))
      .pipeThrough(this.renderDecodedFramesAndGetEncodedChunks(renderFrame))
      .pipeThrough(this.transformIntoWebM())
      // .pipeThrough(pipeToBuffer)
      .pipeTo(this.upload(fileName, "144p", "webm"));

    sendMessage({
      status: "done",
    });
  }
}
