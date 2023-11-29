ExpenseForecaset is a web application, which use Plaid APIs to fetch financial bank statements and use it to predict future expenses. In the backend, it uses lambda function, which use a deployed ML model enpoint for prediction.

Tech stack used

NodeJS,
HTML,
Python,
AWS services(EC2,Lambda,RDS,Sagemaker,Cognito),
Plaid APIs.

Lambda function code - predictExpenseLambda.js,
ML model creation code - deploymodel.py,
Node App frontend and backend code - transactions folder
