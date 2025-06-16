## steps

- read the entire example project in ../12-factor-agents/packages/create-12-factor-agent/template
- read all the api types in ../../metalytics-dev/metalytics/.../humanlayer_vendored* files for webhooks and etc
- update humanlayer sdk models to match the v1Beta3 models in the humanlayer_vendored* files
- create a templates/typescript folder in humanlayer cli repo matching the template in ../12-factor-agents/packages/create-12-factor-agent/template
- update build steps to include the template in dist/ when shipping the humanlayer cli
- create a command `npx humanlayer create NAME` or `npx humanlayer create .` that checks for conflicts, makes dir if necessary, and then copies the template to the new repo, and prints instructions
- ensure readme created is generic and explains how this repo was created with npx humanlayer create
- use npm link from the hlyr repo to prepare to test the creation
- test the creation using `npx humanlayer create tmp-test` and then cd in and use `npx tsx src/index.ts 'what is 3 + 4'` to test the agent
- transfer control to me and i will test the webhooky party

## Goals

A working implementation of

npx humanlayer create

that follows the basic template in ../12-factor-agents/packages/create-12-factor-agent/template

update the models to match the v1Beta3 models - source of truth is in ../../metalytics-dev/metalytics/.../humanlayer_vendored* files for webhooks and etc

includes by default:
- typescript
