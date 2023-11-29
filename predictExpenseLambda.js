import AWS from 'aws-sdk';
const sagemaker = new AWS.SageMaker();
const sagemakerRuntime  = new AWS.SageMakerRuntime ();
import fs from 'fs';
import csv from 'fast-csv';

export const handler = async (event, context) => {
    const endpointName = 'forecasting-deepar-2023-11-08-04-03-03-959';

    const serializer = (data) => JSON.stringify(data);
    const deserializer = (data) => JSON.parse(data);
    
    const csvFileName = event.S3_csv_file_name;

    const bucketName = 'projectforecastdataset';
    const s3 = new AWS.S3();

    const tmpFilePath = '/tmp/transactions.csv';

    const downloadParams = {
        Bucket: bucketName,
        Key: csvFileName,
    };
    
    const fileStream = fs.createWriteStream(tmpFilePath);
    s3.getObject(downloadParams).createReadStream().pipe(fileStream);

    // Wait for the file stream to finish (download completes)
    await new Promise((resolve, reject) => {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
    });

    const historicalData = await parseCsvFile(tmpFilePath);
    //console.log('print1---',historicalData);

    //const categories = Array.from(new Set(historicalData.map(entry => entry.category)));

    // Remove specific categories for prediction
    //const categoriesToRemove = ['TRANSFER_IN', 'LOAN_PAYMENTS', 'TRANSFER_OUT'];
    //const categoriesForPrediction = categories.filter(category => !categoriesToRemove.includes(category));
    
    //our model currently supports prediction only for these categories. once we train the model with more categories, we can more categories here
    const categoriesForPrediction = ['FOOD_AND_DRINK','GENERAL_MERCHANDISE','PERSONAL_CARE','RENT_AND_UTILITIES','TRANSPORTATION','TRAVEL'];

    const categoryMapping = new Map(categoriesForPrediction.map((category, index) => [category, index]));
    console.log('categoryMapping--',categoryMapping);

    const startForPrediction = getStartForPrediction(historicalData);
    //console.log('startForPrediction--',startForPrediction);

    const predictionMonths = getPredictionMonths(startForPrediction, 12);
    
    //console.log('predictionMonths--',predictionMonths);

    const result = [];

    for (const category of categoriesForPrediction) {
        const categoryId = categoryMapping.get(category);
        //console.log('targetData for category--',category);
        const filteredCategoryData = historicalData.filter(entry => entry.category === category);
        //console.log('filteredCategoryData--',filteredCategoryData);
        const targetData = aggregateExpensesByMonth(filteredCategoryData);
        //console.log('targetData--',targetData);

        const categoryData = {
            start: startForPrediction,
            target: targetData,
            cat: [categoryId],
        };

        const requestPayload = {
            instances: [categoryData],
        };

        const prediction = await predict(endpointName, requestPayload, serializer, deserializer);

        //console.log('Prediction for category:', category);
        //console.log(prediction.predictions[0].mean);

        const expenseDict = predictionMonths.reduce((acc, month, index) => {
            acc[month] = prediction.predictions[0].mean[index];
            return acc;
        }, {});

        const categoryResult = {
            Category: category,
            Expense: expenseDict,
        };

        result.push(categoryResult);
    }

    return {
        statusCode: 200,
        body: JSON.stringify(result),
    };
};

function parseCsvFile(filePath) {
     return new Promise((resolve, reject) => {
        const records = [];

        fs.createReadStream(filePath)
            .pipe(csv.parse({ headers: true }))
            .on('error', reject)
            .on('data', (data) => {
                records.push(data);
            })
            .on('end', () => {
                resolve(records);
            });
    });
}

async function predict(endpointName, payload, serializer, deserializer) {
    const params = {
        EndpointName: endpointName,
        Body: serializer(payload),
        ContentType: 'application/json',
    };

    const response = await sagemakerRuntime.invokeEndpoint(params).promise();

    return deserializer(response.Body);
}

function getStartForPrediction(historicalData) {
    const maxDate = new Date(Math.max.apply(null, historicalData.map(entry => new Date(entry.date))));
    return maxDate.toISOString().split('T')[0];;
}

function aggregateExpensesByMonth(categoryData) {
     const aggregatedData = {};

    categoryData.forEach((entry) => {
    const date = new Date(entry.date);
    const monthYear = `${date.getFullYear()}-${(date.getMonth() + 1)
      .toString()
      .padStart(2, '0')}`;

    if (!aggregatedData[monthYear]) {
      aggregatedData[monthYear] = 0;
    }

    aggregatedData[monthYear] += parseFloat(entry.amount);
    });

    // Extract only the aggregated amounts as an array
    const result = Object.values(aggregatedData).map((amount) => parseFloat(amount.toFixed(2)));

    return result;
}

function getPredictionMonths(startForPrediction, numMonths) {
    const predictionMonths = [];
    const startForPredictionDate = new Date(startForPrediction);
    for (let i = 1; i <= numMonths; i++) {
        const nextMonth = new Date(startForPrediction);
        nextMonth.setMonth(startForPredictionDate.getMonth() + i + 1);
        predictionMonths.push(nextMonth.toISOString().slice(0, 7));
    }

    return predictionMonths;
}
