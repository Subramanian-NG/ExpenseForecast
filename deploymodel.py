import pandas as pd

data = pd.read_csv("newtransactions.csv")

display(data)

####################################

data['date'] = pd.to_datetime(data['date'],format="%d-%m-%Y")

data = data.set_index('date')

display(data)

####################################

categories = data['category'].unique()

categories_to_remove = ['TRANSFER_IN', 'LOAN_PAYMENTS', 'TRANSFER_OUT']

categories = [category for category in categories if category not in categories_to_remove]

display(categories)


########################################

category_mapping = {category: i for i, category in enumerate(categories)}

########################################

all_data = []
predictionLength = 12
contextLength = 60
for category in categories:
    # Filter the data for the specific category and prediction month
    category_data = data[data['category'] == category]
    target_data = category_data['amount'].resample('M').sum()  # Aggregate expenses by month
    
    targetDataLen = len(target_data) 
    category_id = int(category_mapping[category])
    
    category_data = {
        'start': str(data.index[0]),
        'target': list(target_data),
        'dynamic_feat': [],  # If you have additional features, include them here
        'cat': [category_id],
    }
    
    display(category_data)
    
    all_data.append(category_data)
	
	
###########################################	
import json

with open('all_data.json', 'w') as f:
    for item in all_data:
        f.write(f'{{"start": "{item["start"]}", "target": {item["target"]}, "cat": {item["cat"][0]}}}\n')
		
############################################		
import sagemaker, boto3, os
bucket = "projectforecastdataset"
prefix = "data"
s3 = boto3.client('s3')
s3.upload_file('all_data.json', bucket, 'data/all_data.json')


#################################################
import sagemaker

from sagemaker.debugger import Rule, ProfilerRule, rule_configs
from sagemaker.session import TrainingInput

bucket = "projectforecastdataset"
prefix = "data"

s3_output_location='s3://{}/{}/{}'.format(bucket, prefix, 'DeepForecast')

region = sagemaker.Session().boto_region_name
print("AWS Region: {}".format(region))

role = 'arn:aws:iam::120674606655:role/LabRole'
print("RoleArn: {}".format(role))

container=sagemaker.image_uris.retrieve("forecasting-deepar", region)
print(container)

estimator=sagemaker.estimator.Estimator(
    image_uri=container,
    role=role,
    instance_count=1,
    instance_type='ml.m4.xlarge',
    volume_size=5,
    max_run=3600,
    input_mode='File',
    output_path=s3_output_location,
    sagemaker_session=sagemaker.Session(),
)


##################################################
hyperparameters = {
    "prediction_length": predictionLength,
    "context_length": contextLength,
    "time_freq": "M",
    "num_cells": "40",
    "num_layers": "3",
    "likelihood": "gaussian",
    "epochs": "100",
    "mini_batch_size": "32",
    "num_dynamic_feat":"0",
    "learning_rate":"0.001",
    "dropout_rate":"0.1",
    "test_quantiles":[0.1, 0.5, 0.9],
    #"num_eval_samples":"10",
}

estimator.set_hyperparameters(**hyperparameters)


######################################################
data_channels = {
    "train": "s3://projectforecastdataset/data/all_data.json",
}


#######################################################
estimator.fit(inputs=data_channels)

#######################################################
import sagemaker
from sagemaker.serializers import CSVSerializer

predictor = estimator.deploy(
    initial_instance_count=1,
    instance_type='ml.t2.medium'
)
