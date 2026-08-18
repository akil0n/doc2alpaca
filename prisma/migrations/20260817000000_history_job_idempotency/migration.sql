-- 同一个深度分析会话只能生成一条历史，防止队列至少一次投递造成重复记录
ALTER TABLE "GeneratedHistory" ADD COLUMN "sourceSessionId" TEXT;

CREATE UNIQUE INDEX "GeneratedHistory_sourceSessionId_key"
ON "GeneratedHistory"("sourceSessionId");
