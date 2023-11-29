require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const https = require("https");
const path = require("path");
const fs = require("fs");
const http = require("http");

const APP_PORT = process.env.APP_PORT || 8000;
const HTTPS_APP_PORT = 8443;

/**
 * Initialization!
 */

// Set up the server

const app = express();
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("./public"));

app.use((req, res, next) => {
  console.log("Middleware before redirection");
  next();
});

app.get("*", function (req, res, next) {
  console.log("request type--", req.protocol);
  console.log("request host--", req.headers.host);
  if (req.protocol === "http") {
    const redirectTo =
      "https://" +
      req.headers.host.replace(/:\d+$/, ":" + HTTPS_APP_PORT) +
      req.url;
    console.log("redirectTo--", redirectTo);
    res.redirect(redirectTo);
  } else {
    next();
  }
});

const options = {
  key: fs.readFileSync(path.join(__dirname, "server.key")),
  cert: fs.readFileSync(path.join(__dirname, "server.cert")),
};

http.createServer(app).listen(APP_PORT, function () {
  console.log("Express http server listening on port 8000");
});

https.createServer(options, app).listen(HTTPS_APP_PORT, function () {
  console.log("Express https server listening on port 443");
});

const usersRouter = require("./routes/users");
const linkTokenRouter = require("./routes/tokens");
const bankRouter = require("./routes/banks");
const { router: transactionsRouter } = require("./routes/transactions");
const debugRouter = require("./routes/debug");
const awsServiceRouter = require("./routes/awsservices");

app.use("/server/users", usersRouter);
app.use("/server/tokens", linkTokenRouter);
app.use("/server/banks", bankRouter);
app.use("/server/transactions", transactionsRouter);
app.use("/server/debug", debugRouter);
app.use("/server/awsservices", awsServiceRouter);

/* Add in some basic error handling so our server doesn't crash if we run into
 * an error.
 */
const errorHandler = function (err, req, res, next) {
  console.error(`Your error:`);
  console.error(err);
  if (err.response?.data != null) {
    res.status(500).send(err.response.data);
  } else {
    res.status(500).send({
      error_code: "OTHER_ERROR",
      error_message: "I got some other message on the server.",
    });
  }
};
app.use(errorHandler);
