'use strict';
const {onRequest}=require('firebase-functions/v2/https');
const {defineSecret,defineString}=require('firebase-functions/params');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getStorage}=require('firebase-admin/storage');
const logger=require('firebase-functions/logger');
const {createHandler}=require('./handler.cjs');
const {storageAdapter}=require('./store.cjs');
initializeApp();
const dataKeys=defineSecret('STE_DATA_KEYS'),auditKey=defineSecret('STE_AUDIT_KEY');
const bucket=defineString('STE_PRIVATE_BUCKET');
exports.steApi=onRequest({region:'us-central1',memory:'1GiB',timeoutSeconds:120,maxInstances:2,concurrency:1,cors:false,invoker:'public',serviceAccount:'ste-api@ste2026-app.iam.gserviceaccount.com',secrets:[dataKeys,auditKey]},async(req,res)=>{
  const handler=createHandler({auth:getAuth(),store:storageAdapter(getStorage().bucket(bucket.value())),keys:dataKeys.value(),auditKey:auditKey.value(),audit:entry=>logger.info('ste_audit',entry)});
  return handler(req,res);
});
