import {configureGenkit} from "@genkit-ai/core";
import {firebase} from "@genkit-ai/firebase";
import {googleAI} from "@genkit-ai/googleai";

export default configureGenkit({
  plugins: [
    firebase(),
    googleAI({
      apiVersion: "v1beta",
    }),
  ],
  logLevel: "debug",
  enableTracingAndMetrics: true,
});
