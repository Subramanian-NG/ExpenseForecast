import { startLink } from "./link.js";
import {
  createNewUser,
  refreshSignInStatus,
  signIn,
  signOut,
} from "./signin.js";
import {
  callMyServer,
  currencyAmount,
  humanReadableCategory,
  showSelector,
} from "./utils.js";

var txnData;
var predictedExpenses;
var categories = [];
var months = [];
var chartInstance;
var chartInstance1;
var chartInstance2;
let dbInitialized = false;
let userInitialized = false;
export const refreshConnectedBanks = async () => {
  console.log("refesh connected banks");
  const banksMsg = document.querySelector("#banksMsg");
  const bankData = await callMyServer("/server/banks/list");
  if (bankData == null || bankData.length === 0) {
    banksMsg.textContent = "You aren't connected to any banks yet. 🙁";
  } else if (bankData.length === 1) {
    banksMsg.textContent = `You're connected to ${
      bankData[0].bank_name ?? "unknown"
    }`;
  } else {
    banksMsg.textContent =
      `You're connected to ` +
      bankData
        .map((e, idx) => {
          return (
            (idx == bankData.length - 1 && bankData.length > 1 ? "and " : "") +
            (e.bank_name ?? "(Unknown)")
          );
        })
        .join(bankData.length !== 2 ? ", " : " ");
  }
  document.querySelector("#connectToBank").textContent =
    bankData != null && bankData.length > 0
      ? "Connect another bank!"
      : "Connect a bank!";

  // Fill out our "Remove this bank" drop-down
  const bankOptions = bankData.map(
    (bank) => `<option value=${bank.id}>${bank.bank_name}</option>`
  );
  const bankSelect = document.querySelector("#deactivateBankSelect");
  //bankSelect.innerHTML =`<option>--Pick one--</option>` + bankOptions.join("\n");
};

function handlePagination(currentPage) {
  var itemsPerPage = 20; // Set the number of items per page
  var startIndex = (currentPage - 1) * itemsPerPage;
  var slicedData = txnData.slice(startIndex, startIndex + itemsPerPage);
  //console.log("slicedData--", slicedData);
  showTransactionData(slicedData);
}

const showTransactionData = (pageData) => {
  //console.log("txnData-from callback--", txnData);
  const tableRows = pageData.map((txnObj) => {
    return `<tr>
    <td>${txnObj.date}</td>
    <td>${txnObj.name}</td>
    <td>${humanReadableCategory(txnObj.category)}</td>
    <td class="text-end">${txnObj.amount}</td>
    <td>${txnObj.bank_name}<br/>${txnObj.account_name}</td>
    </tr>`;
  });
  document.querySelector("#transactionTable").innerHTML = tableRows.join("\n");
};

const connectToBank = async () => {
  if (!userInitialized) {
    const userId = Math.floor(Math.random() * 1000000);
    await callMyServer("/server/users/sign_in", true, { userId: userId });
    userInitialized = true;
  }
  await startLink(() => {
    refreshConnectedBanks();
  });
};

export const clientRefresh = async () => {
  // Fetch my transactions from the database

  txnData = await callMyServer("/server/transactions/list?maxCount=50");
  //console.log("txnData---", txnData);
  showTransactionData(txnData);
};

const serverRefresh = async () => {
  await callMyServer("/server/transactions/sync", true);
};

const reinitializeDB = async () => {
  await callMyServer("/server/debug/reinitialize", true);
};

const fetchTransactions = async () => {
  $("#statusMsg").show();
  document.getElementById("loadingDiv").style.display = "block";
  await callMyServer("/server/transactions/sync", true);
  document.getElementById("loadingDiv").style.display = "none";
  txnData = await callMyServer("/server/transactions/list");
  //remove negative amounts
  txnData = txnData.filter((transaction) => transaction.amount >= 0);
  //currently our model predicts only for below categories. one we add more categories for training, we can add more categories.
  const categoriesToFilter = [
    "FOOD_AND_DRINK",
    "GENERAL_MERCHANDISE",
    "PERSONAL_CARE",
    "RENT_AND_UTILITIES",
    "TRANSPORTATION",
    "TRAVEL",
  ];
  txnData = txnData.filter((transaction) => {
    return categoriesToFilter.includes(transaction.category);
  });
  //console.log("row1 - ", txnData[0]);
  //console.log("row2 - ", txnData[1]);
  const itemsPerPage = 20;
  handlePagination(1);
  $("#pagination-container").pagination({
    items: txnData.length,
    itemsOnPage: itemsPerPage,
    onPageClick: function (pageNumber) {
      handlePagination(pageNumber);
    },
  });
  const accountTypes = {};
  var select = document.getElementById("accountType");
  select.innerHTML = "";
  select.addEventListener("change", updateChart);
  var option = document.createElement("option");
  option.value = "All";
  option.text = "All";
  option.selected = true;
  select.add(option);
  txnData.forEach((item) => {
    item.account_bank_name = `${item.account_name} - ${item.bank_name}`;
    // console.log(
    //   "existing array value for --",
    //   item.account_bank_name,
    //   "--",
    //   accountTypes[item.account_bank_name]
    // );
    if (accountTypes[item.account_bank_name] == undefined) {
      //console.log("adding-- ", item.account_bank_name);
      accountTypes[item.account_bank_name] = 0;
      var option = document.createElement("option");
      option.value = item.account_bank_name;
      option.text = item.account_bank_name;
      select.add(option);
    } else {
      //console.log("not adding-- ", item.account_bank_name);
    }
  });

  $("#statusMsg").hide();
  $("#fetchTransactions").show();
  $("#predictExpense").show();
  updateChart();
};

const predictExpense = async () => {
  $("#statusMsgPredict").show();
  document.getElementById("loadingDiv").style.display = "block";
  try {
    //upload the transaction data to s3 as csv
    //console.log("txndata--", txnData);

    const csvFileName = await callMyServer(
      "/server/awsservices/s3Upload",
      true,
      {
        txnData: txnData,
      }
    );

    console.log("response csvFileName--", csvFileName);

    const lambdaResponse = await callMyServer(
      "/server/awsservices/invokeLambda",
      true,
      {
        csvFileName: csvFileName,
      }
    );
    predictedExpenses = lambdaResponse.body;
    console.log("predictedExpenses--", predictedExpenses);
    console.log(typeof predictedExpenses);
    predictedExpenses = JSON.parse(predictedExpenses);
    console.log(typeof predictedExpenses);
    var monthsSet = new Set();
    var categorySet = new Set();
    predictedExpenses.forEach(function (item) {
      categorySet.add(item.Category);
      Object.keys(item.Expense).forEach(function (month) {
        monthsSet.add(month);
      });
    });
    categories = Array.from(categorySet);
    months = Array.from(monthsSet);
    plotPredictedExpense();
  } catch (error) {
    console.error("Error invoking Lambda function:", error);
    // Handle error
  }

  document.getElementById("loadingDiv").style.display = "none";
  $("#graphViewData").hide();
  $("#tableViewData").hide();
  $("#statusMsgPredict").hide();
  $("#predictedExpenseView").show();
  $("#graphViewLink").hide();
  $("#tableViewLink").hide();
  $("#backLink").show();
  $("#predictExpense").hide();
  $("#fetchTransactions").hide();
};

function plotPredictedExpense() {
  var categorySelect = document.getElementById("categorySelect");
  categorySelect.innerHTML = "";
  categories.forEach(function (category) {
    var option = document.createElement("option");
    option.value = category;
    option.text = category;
    categorySelect.appendChild(option);
  });

  var selectedCategory = categories[0];
  updatePredictedExpenseChart1(selectedCategory);

  // Update chart when category changes
  categorySelect.addEventListener("change", function () {
    selectedCategory = this.value;
    updatePredictedExpenseChart1(selectedCategory);
  });

  var monthSelect = document.getElementById("monthSelect");
  monthSelect.innerHTML = "";

  months.forEach(function (month) {
    var option = document.createElement("option");
    option.value = month;
    option.text = month;
    monthSelect.appendChild(option);
  });

  var selectedMonth = months[0];
  updatePredictedExpenseChart2(selectedMonth);

  // Update chart when month changes
  monthSelect.addEventListener("change", function () {
    selectedMonth = this.value;
    updatePredictedExpenseChart2(selectedMonth);
  });
}

function updatePredictedExpenseChart1(category) {
  if (chartInstance1 instanceof Chart) {
    chartInstance1.destroy(); // Destroy the existing chart
  }

  var dataPoints = [];

  predictedExpenses.forEach(function (item) {
    if (item.Category === category) {
      for (var i = 0; i < months.length; i++) {
        var month = months[i];
        var expense = item.Expense[month] || 0;
        dataPoints.push(expense);
      }
    }
  });
  var ctx = document.getElementById("pivotChart1").getContext("2d");
  const label =
    "Projected Expense for " +
    category +
    "(" +
    monthToString(months[0]) +
    " to " +
    monthToString(months[months.length - 1]) +
    ")";
  chartInstance1 = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        {
          label: "Expense Amount in CAD",
          data: dataPoints,
          backgroundColor: "rgba(75, 192, 192, 0.2)",
          borderColor: "rgba(75, 192, 192, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
        },
      },
      barThickness: 30,
      plugins: {
        title: {
          display: true,
          text: label,
          position: "top",
          font: {
            size: 16,
            weight: "bold",
          },
        },
      },
    },
  });
}

function updatePredictedExpenseChart2(month) {
  if (chartInstance2 instanceof Chart) {
    chartInstance2.destroy(); // Destroy the existing chart
  }

  var dataPoints = [];

  predictedExpenses.forEach(function (item) {
    var expense = item.Expense[month] || 0;
    dataPoints.push(expense);
  });

  var ctx = document.getElementById("pivotChart2").getContext("2d");
  const label = "Projected Expense for the month " + monthToString(month);

  chartInstance2 = new Chart(ctx, {
    type: "bar",
    data: {
      labels: predictedExpenses.map((item) => item.Category),
      datasets: [
        {
          label: "Expense Amount in CAD",
          data: dataPoints,
          backgroundColor: "rgba(75, 192, 192, 0.2)",
          borderColor: "rgba(75, 192, 192, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
        },
      },
      barThickness: 30,
      plugins: {
        title: {
          display: true,
          text: label,
          position: "top",
          font: {
            size: 16,
            weight: "bold",
          },
        },
      },
    },
  });
}

function updateChart() {
  const selectedAccountType = document.getElementById("accountType").value;

  //console.log("all data--", txnData);

  const minDate = new Date(
    Math.min(...txnData.map((entry) => new Date(entry.date)))
  );
  const maxDate = new Date(
    Math.max(...txnData.map((entry) => new Date(entry.date)))
  );

  const filteredData =
    selectedAccountType === "All"
      ? txnData
      : txnData.filter(
          (item) => `${item.account_bank_name}` === selectedAccountType
        );

  //console.log("transportation data");
  //console.log(txnData.filter((item) => `${item.category}` === "TRANSPORTATION"));
  //console.log("filtered data for ", selectedAccountType);
  //console.log(filteredData);

  // Extract categories and calculate the total amount for each category
  const categories = {};
  filteredData.forEach((item) => {
    if (categories[item.category] == undefined) {
      categories[item.category] = 0;
    }
    // if (item.category == "TRANSPORTATION") {
    //   console.log("amount value--", categories[item.category]);
    // }
    categories[item.category] += item.amount;
  });

  //console.log("categories--", categories);
  const categoryNames = Object.keys(categories);
  const categoryAmounts = Object.values(categories);
  if (chartInstance instanceof Chart) {
    chartInstance.destroy(); // Destroy the existing chart
  }
  const ctx = document.getElementById("pivotChart").getContext("2d");
  const label = `Expense Amount(${minDate.toDateString()} to ${maxDate.toDateString()})`;
  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: categoryNames,
      datasets: [
        {
          label: "Expense Amount in CAD",
          data: categoryAmounts,
          backgroundColor: "rgba(75, 192, 192, 0.2)",
          borderColor: "rgba(75, 192, 192, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
        },
      },
      plugins: {
        title: {
          display: true,
          text: label,
          position: "top",
          font: {
            size: 16,
            weight: "bold",
          },
        },
      },
      barThickness: 30,
    },
  });
}

const generateWebhook = async () => {
  // Tell my server to generate a webhook
  /*
  await callMyServer("/server/debug/generate_webhook", true);
  */
};

const deactivateBank = async () => {
  // Tell my server to remove a bank from my list of active banks

  const itemId = document.querySelector("#deactivateBankSelect").value;
  if (itemId != null && itemId !== "") {
    await callMyServer("/server/banks/deactivate", true, { itemId: itemId });
    await refreshConnectedBanks();
  }
};

//Connect selectors to functions
const selectorsAndFunctions = {
  //"#createAccount": createNewUser,
  //"#signIn": signIn,
  //"#signOut": signOut,
  "#connectToBank": connectToBank,
  //"#serverRefresh": serverRefresh,
  //"#clientRefresh": clientRefresh,
  //"#deactivateBank": deactivateBank,
  "#fetchTransactions": fetchTransactions,
  "#predictExpense": predictExpense,
  "#graphViewLink": toggleDataView("graphView"),
  "#tableViewLink": toggleDataView("tableView"),
};

Object.entries(selectorsAndFunctions).forEach(([sel, fun]) => {
  if (document.querySelector(sel) == null) {
    console.warn(`Hmm... couldn't find ${sel}`);
  } else {
    document.querySelector(sel)?.addEventListener("click", fun);
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  //in real time production setup, we will remove this
  if (!dbInitialized) {
    try {
      await reinitializeDB();
      console.log("DB reinitialized successfully");
      dbInitialized = true;
    } catch (error) {
      console.error("Error reinitializing DB:", error);
      // Handle the error as needed
    }
  }
});

function monthToString(dateString) {
  // Parse the input string to a Date object
  //console.log("dateString--", dateString);
  //console.log(typeof dateString);
  const dateObject = new Date(`${dateString}-02`);
  //console.log(dateObject);
  let options = { month: "long", year: "numeric" };

  // Format the date as 'Month Year'
  let formattedDate = dateObject.toLocaleDateString("en-US", options);

  return formattedDate;
}
