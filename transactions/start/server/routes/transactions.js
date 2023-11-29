const express = require("express");
const { getLoggedInUserId } = require("../utils");
const db = require("../db");
const { plaidClient } = require("../plaid");
const { setTimeout } = require("timers/promises");
const { SimpleTransaction } = require("../simpleTransactionObject");

const router = express.Router();

/**
 * This will ask our server to make a transactions sync call
 * against all the items it has for a particular user. This is one way
 * you can keep your transaction data up to date, but it's preferable
 * to just fetch data for a single item in response to a webhook.
 */
router.post("/sync", async (req, res, next) => {
  try {
    const userId = getLoggedInUserId(req);
    const items = await db.getItemIdsForUser(userId);
    console.log("----items for userId--", items);
    const itemPromises = items.map((item) => syncTransactions(item.id));
    const fullTransactions = await Promise.all(itemPromises);
    // const fullTransactions = await Promise.all(
    //   items.forEach((item) => {
    //     syncTransactions(item.id);
    //   })
    // );
    res.json({ fullResults: fullTransactions });
  } catch (error) {
    console.log(`Running into an error!`);
    next(error);
  }
});

/**
 * Given an item ID, this will fetch all transactions for all accounts
 * associated with this item using the sync API. We can call this manually
 * using the /sync endpoint above, or we can call this in response
 * to a webhook
 */
const syncTransactions = async function (itemId) {
  const summary = { added: 0, removed: 0, modified: 0 };
  const {
    access_token: accessToken,
    transaction_cursor: transactionCursor,
    user_id: userId,
  } = await db.getItemInfo(itemId);
  const results = await fetchLatestData(accessToken, transactionCursor);
  //console.log("results--", results);

  //add transaction to DB
  await Promise.all(
    results.map(async (txnObj) => {
      //console.log("Transaction entry--", txnObj);
      const newTransaction = SimpleTransaction.fromPlaidTransaction(
        txnObj,
        userId
      );
      const addedTransaction = await db.addNewTransaction(newTransaction);
      if (addedTransaction) {
        summary.added += addedTransaction.changes;
      }
    })
  );

  //update next cursor in DB
  //await db.saveCursorForItem(results.nextCursor, itemId);

  return summary;
};

const fetchLatestData = async function (accessToken, transactionCursor) {
  let continueParse = false;
  // const allData = {
  //   added: [],
  //   modified: [],
  //   removed: [],
  //   nextCursor: transactionCursor,
  // };
  //do {
  //const results = await plaidClient.transactionsSync()
  //console.log("fetchLatestData accessToken--", accessToken);
  const results = await plaidClient.transactionsGet({
    access_token: accessToken,
    //cursor: allData.nextCursor,
    start_date: "2018-01-01",
    end_date: "2023-11-01",
    options: {
      include_personal_finance_category: true,
      //start_date: "2018-01-01",
    },
  });
  //console.log("results from transactionget--", results.data.transactions);
  const fetchedData = results.data.transactions;
  // allData.added = allData.added.concat(fetchedData.added);
  // allData.modified = allData.modified.concat(fetchedData.modified);
  // allData.removed = allData.removed.concat(fetchedData.removed);
  // allData.nextCursor = fetchedData.next_cursor;
  // continueParse = fetchedData.has_more;
  //} while (continueParse == true);
  return fetchedData;
};

/**
 * Fetch all the transactions for a particular user (up to a limit)
 * This is really just a simple database query, since our server has already
 * fetched these items using the syncTransactions call above
 *
 */
router.get("/list", async (req, res, next) => {
  try {
    const userId = getLoggedInUserId(req);
    const maxCount = req.params.maxCount ?? 50000;
    const transactions = await db.getTransactionsForUser(userId, maxCount);
    res.json(transactions);
  } catch (error) {
    console.log(`Running into an error!`);
    next(error);
  }
});

module.exports = { router, syncTransactions };
