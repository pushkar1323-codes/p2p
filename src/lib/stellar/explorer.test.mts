import { test } from "node:test";
import assert from "node:assert/strict";
import { testnetContractExplorerUrl } from "./explorer.ts";

test("testnetContractExplorerUrl builds a stellar.expert testnet contract link", () => {
  assert.equal(
    testnetContractExplorerUrl("CAKENBWT2237ASCTOZMFOMQTYWYRXQRMVX7N20YGH67P7YMJFOD2L7YA"),
    "https://stellar.expert/explorer/testnet/contract/CAKENBWT2237ASCTOZMFOMQTYWYRXQRMVX7N20YGH67P7YMJFOD2L7YA"
  );
});
