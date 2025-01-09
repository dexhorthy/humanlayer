# Task Classifier Example

### Three versions

- [01-no-humans.ts](./01-no-humans.ts) - classify the emails with no human intervention
- [02-humans.ts](./02-human-review-sync.ts) - classify the emails, checking with a human before saving classifications, then print results
- [03-humans-async.ts](./03-humans-async.ts) - classify the emails, print them out, then start a webserver to listen for human overrides. When a human feedback is received, print the updated list.

### Running the examples


This example in [05-task-classifier.ts](./05-task-classifier.ts) shows how you can use OpenAI to classify emails, and use HumanLayer to review/update
those classifications either

1. in real time as classifications are processed
2. after the fact 

```
Classifying emails...

Results:

Subject: Exclusive Partnership Opportunity
Classification: action

Subject: Team Sync Notes - Product Launch
Classification: action

Subject: Your Account Security
Classification: action

Subject: Quick question about API docs
Classification: action

Subject: Weekly Newsletter - Tech Industry Updates
Classification: read_review
```


### Roadmap for this example

- multiple labels on a single object - ux on the humanlayer side + 

