CREATE TABLE "blockchain_transactions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"transaction_hash" text NOT NULL,
	"network" text NOT NULL,
	"status" text NOT NULL,
	"action_type" text,
	"contract_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"error_code" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "contract_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"transaction_hash" text NOT NULL,
	"contract_id" text NOT NULL,
	"network" text NOT NULL,
	"event_type" text NOT NULL,
	"ledger_sequence" bigint,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "blockchain_transactions_tx_hash_unique" ON "blockchain_transactions" USING btree ("transaction_hash");--> statement-breakpoint
CREATE INDEX "blockchain_transactions_network_idx" ON "blockchain_transactions" USING btree ("network");--> statement-breakpoint
CREATE INDEX "blockchain_transactions_contract_id_idx" ON "blockchain_transactions" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_events_tx_hash_event_type_unique" ON "contract_events" USING btree ("transaction_hash","event_type");--> statement-breakpoint
CREATE INDEX "contract_events_contract_id_idx" ON "contract_events" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "contract_events_network_idx" ON "contract_events" USING btree ("network");