const fs = require("fs");
const mysql = require("mysql");
//const mysql = require("mysql2/promise");
const { SimpleTransaction } = require("./simpleTransactionObject");
const util = require("util");

const db = mysql.createConnection({
  host: "database-1.cdbkrcukimsv.us-east-1.rds.amazonaws.com",
  user: "admin",
  password: "admin123",
  database: "ExpenseForecast",
});

const dbQuery = util.promisify(db.query).bind(db);

db.connect(function (err) {
  if (err) {
    console.error("Database connection failed: " + err.stack);
    return;
  }

  console.log("Connected to database.");
});

const debugExposeDb = function () {
  return db;
};

const getItemIdsForUser = async function (userId) {
  try {
    const result = await dbQuery("SELECT id FROM items WHERE user_id = ?", [
      userId,
    ]);
    console.log("result from DB call--", result);
    return result;
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

const getItemsAndAccessTokensForUser = async function (userId) {
  try {
    const result = await dbQuery(
      "SELECT id, access_token FROM items WHERE user_id = ?",
      [userId]
    );
    return result;
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

const getAccountIdsForItem = async function (itemId) {
  try {
    const rows = await dbQuery("SELECT id FROM accounts WHERE item_id = ?", [
      itemId,
    ]);
    return rows;
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

const confirmItemBelongsToUser = async function (possibleItemId, userId) {
  try {
    const rows = await dbQuery(
      "SELECT id FROM items WHERE id = ? AND user_id = ?",
      [possibleItemId, userId]
    );
    console.log(rows[0]);
    if (rows.length === 1 && rows[0].id === possibleItemId) {
      return true;
    } else {
      console.warn(
        `User ${userId} claims to own an item they don't: ${possibleItemId}`
      );
      return false;
    }
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

const deactivateItem = async function (itemId) {
  try {
    const rows = await dbQuery("DELETE from items WHERE id = ?", [itemId]);
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

const reinitializeDB = async function () {
  try {
    // Delete from transactions
    await dbQuery("DELETE from transactions");

    // Delete from accounts
    await dbQuery("DELETE from accounts");

    // Delete from items
    await dbQuery("DELETE from items");

    // Delete from users
    await dbQuery("DELETE from users");
  } catch (err) {
    console.error("Error reinialize :", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

const addUser = async function (userId, username) {
  try {
    const rows = await dbQuery(
      "INSERT INTO users (id, username) VALUES (?, ?)",
      [userId, username]
    );
    return rows;
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

const getUserList = async function () {
  try {
    const rows = await dbQuery("SELECT id, username FROM users");
    return rows;
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

const getUserRecord = async function (userId) {
  try {
    const rows = await dbQuery("SELECT * FROM users WHERE id = ?", [userId]);
    return rows[0];
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

const getBankNamesForUser = async function (userId) {
  try {
    const result = await dbQuery(
      "SELECT id, bank_name FROM items WHERE user_id = ?",
      [userId]
    );
    //console.log("query result1--", result);
    return result;
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

const addItem = async function (itemId, userId, accessToken) {
  try {
    const rows = await dbQuery(
      "INSERT INTO items (id, user_id, access_token) VALUES (?, ?, ?)",
      [itemId, userId, accessToken]
    );
    return rows;
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

const addBankNameForItem = async function (itemId, institutionName) {
  try {
    const rows = await dbQuery("UPDATE items SET bank_name = ? WHERE id = ?", [
      institutionName,
      itemId,
    ]);
    return rows;
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

const addAccount = async function (accountId, itemId, acctName) {
  try {
    const rows = await new Promise((resolve, reject) => {
      dbQuery(
        `INSERT IGNORE INTO accounts (id, item_id, name) VALUES (?, ?, ?)`,
        [accountId, itemId, acctName],
        (err, results) => {
          if (err) {
            console.error("Error inserting item:", err);
            reject(err);
          } else {
            resolve(results);
          }
        }
      );
    });
    return rows;
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

const getItemInfo = async function (itemId) {
  try {
    const rows = await dbQuery(
      `SELECT user_id, access_token, transaction_cursor FROM items WHERE id = ?`,
      itemId
    );
    const result = JSON.parse(JSON.stringify(rows));
    return result[0];
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

const getItemInfoForUser = async function (itemId, userId) {
  try {
    const rows = await dbQuery(
      `SELECT user_id, access_token, transaction_cursor FROM items 
    WHERE id = ? AND user_id = ?`,
      itemId,
      userId
    );
    return rows;
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

/**
 * Add a new transaction to our database
 *
 * @param {SimpleTransaction} transactionObj
 */
const addNewTransaction = async function (transactionObj) {
  try {
    const rows = await new Promise((resolve, reject) => {
      dbQuery(
        `INSERT IGNORE INTO transactions 
        (id, user_id, account_id, category, date, authorized_date, name, amount, currency_code, is_removed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transactionObj.id,
          transactionObj.userId,
          transactionObj.accountId,
          transactionObj.category,
          transactionObj.date,
          transactionObj.authorizedDate,
          transactionObj.name,
          transactionObj.amount,
          transactionObj.currencyCode,
          0,
        ],
        (err, results) => {
          if (err) {
            console.error("Error inserting item:", err);
            reject(err);
          } else {
            resolve(results);
          }
        }
      );
    });
    return rows;
  } catch (err) {
    console.error("Error inserting transaction:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

/**
 * Fetch transactions for our user from the database
 *
 * @param {string} userId
 * @param {number} maxNum
 */
const getTransactionsForUser = async function (userId, maxNum) {
  try {
    const rows = await new Promise((resolve, reject) => {
      dbQuery(
        `SELECT transactions.*,
        accounts.name as account_name,
        items.bank_name as bank_name
        FROM transactions
        JOIN accounts ON transactions.account_id = accounts.id
        JOIN items ON accounts.item_id = items.id
        WHERE transactions.user_id = ?
        AND transactions.is_removed = 0
        ORDER BY transactions.date DESC
        LIMIT ?`,
        [userId, maxNum],
        (err, results) => {
          if (err) {
            console.error("Error inserting item:", err);
            reject(err);
          } else {
            resolve(results);
          }
        }
      );
    });
    return rows;
  } catch (err) {
    console.error("Error inserting item:", err);
    throw err; // You can choose to rethrow the error or handle it as needed
  }
};

module.exports = {
  debugExposeDb,
  getItemIdsForUser,
  getItemsAndAccessTokensForUser,
  getAccountIdsForItem,
  confirmItemBelongsToUser,
  deactivateItem,
  addUser,
  getUserList,
  getUserRecord,
  getBankNamesForUser,
  addItem,
  addBankNameForItem,
  addAccount,
  getItemInfo,
  getItemInfoForUser,
  addNewTransaction,
  getTransactionsForUser,
  reinitializeDB,
};
