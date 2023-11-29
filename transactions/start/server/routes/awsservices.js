const express = require("express");
const AWS = require("aws-sdk");
const csv = require("fast-csv");
const router = express.Router();
const fs = require("fs");
const region = "us-east-1";

 AWS.config.update({
   accessKeyId: "ASIARYGGELY7RT6HB7FR",
  secretAccessKey: "dIIhR0K0q5iVvIO1avVmzYONYhPoxCJPU2atbXh2",
  // Optionally, if you are using temporary security credentials
  sessionToken:
    "FwoGZXIvYXdzECEaDJec/ta0IfdiDkNWVSLUAXu5OYBakeW8lcPs9eKUBkdlrURiST9zh4iMTFfwin/Y8MfM/VNBK10RIxuxNkvbvy32eRE67v0w69dtjI+74iIUmoA8HFFFssqrdOK7Xlu1w4Uj04j+pmCqFuDz8omYNegF0tbTAAx+8uTT6lp9LrpKdCStmSUpPcxHidznSiylzLlIk0W5xBSuUOBT9NLI18uOaD53pRkepBsnzQyRQGExWa00gD/b5OeauspOdRz7EXIaQcvjw3UrhhkNqw6yUXg8ZwI+hEvdVqd6ANLiN9Pc08MJKNnkhKsGMi2afDad8Twsp+cpqcnxsNVxrvZkRl8SJQw0gqk06KTbNcMSxfZFfvoC/7n5s3U=",
  region: region,
}); 

router.post("/s3Upload", async (req, res, next) => {
  try {
    const txnData = req.body.txnData;
    const randomNumber = Math.floor(Math.random() * 1000000);
    const fileName = "transactions_" + randomNumber + ".csv";
    const header = ["category", "date", "name", "amount"];
    const headerString = header.join(",");
    const rowItems = txnData.map((row) =>
      header.map((fieldName) => JSON.stringify(row[fieldName] ?? "")).join(",")
    );
    const csvContent = [headerString, ...rowItems].join("\r\n");

    //console.log("csv content--");
    //console.log(csvContent);

    const s3 = new AWS.S3();
    const params = {
      Bucket: "projectforecastdataset",
      Key: fileName,
      Body: csvContent,
      ContentType: "text/csv",
    };
    s3.upload(params, (err, data) => {
      if (err) {
        console.error("Error uploading to S3:", err);
      } else {
        console.log("File uploaded successfully. S3 Location:", data.Location);
      }
    });
    //console.log("to be returned filename--", fileName);
    res.json(fileName);
  } catch (error) {
    next(error);
  }
});

router.post("/invokeLambda", async (req, res, next) => {
  try {
    const csvFileName = req.body.csvFileName;
    //console.log("csv file for prediction--", csvFileName);
    const lambdaParams = {
      FunctionName: "predictExpenseFunc",
      InvocationType: "RequestResponse",
      Payload: JSON.stringify({
        S3_csv_file_name: csvFileName,
      }),
    };
    const lambda = new AWS.Lambda();
    const result = await lambda.invoke(lambdaParams).promise();
    const lambdaResponse = JSON.parse(result.Payload);
    //console.log("Lambda Response:", lambdaResponse);
    res.json(lambdaResponse);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
