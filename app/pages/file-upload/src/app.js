import Clock from "./deps/clock.js";
import View from "./view.js";

const view = new View();
const clock = new Clock();

const worker = new Worker("./src/worker/worker.js", {
  type: "module",
});

worker.onerror = (error) => {
  console.error("error worker: ", error);
};

worker.onmessage = ({ data }) => {
  if (data.status !== "done") return;
  clock.stop();
  view.updateElapsedTime(`Process took ${took.replace("ago", "")}`);

  if (data.buffer && data.buffer.length > 0 && data.fileName) {
    view.downloadBlobAsFile(data.buffer, data.fileName);
  }
};

let took = "";

view.configureOnFileChange((file) => {
  const canvas = view.getCanvas();

  worker.postMessage({ file, canvas }, [canvas]);

  clock.start((time) => {
    took = time;
    view.updateElapsedTime(`Process started ${time}`);
  });
});
