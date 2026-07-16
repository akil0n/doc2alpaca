import { QuestionSearchIndex, type QuestionSearchQuery } from "../lib/questionSearch";
import type { QARecord } from "../lib/qaPipeline";

let index = new QuestionSearchIndex([]);

self.onmessage = (event: MessageEvent<
  | { type: "init"; records: QARecord[] }
  | { type: "search"; requestId: number; query: QuestionSearchQuery }
>) => {
  if (event.data.type === "init") {
    index = new QuestionSearchIndex(event.data.records);
    return;
  }
  const results = index.search(event.data.query);
  self.postMessage({ type: "results", requestId: event.data.requestId, results });
};

export {};
