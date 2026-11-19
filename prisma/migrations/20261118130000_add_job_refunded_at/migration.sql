-- Set once when a cancelled job's charge is refunded; null = not refunded.
ALTER TABLE "QuantumJobSubmission" ADD COLUMN "refundedAt" TIMESTAMP(3);
