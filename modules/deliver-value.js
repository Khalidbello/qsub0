// module to deliver value
const Flutterwave = require('flutterwave-node-v3');
const request = require('request');
const handlebars = require('handlebars');
const nodemailer = require('nodemailer');
const { dateFormatter, fundWallet } = require('./helper_functions.js');
const sendMessage = require('./../bot_modules/send_message.js');
const sendTemplate = require('./../bot_modules/send_templates.js');
const { retryFailedTemplate, responseServices2 } = require('./../bot_modules/templates.js');
const fsP = require('fs').promises;
const Transactions = require('./../models/transactions.js');
const Users = require('./../models/users.js');
const { ObjectId } = require('mongodb');

const transporter = nodemailer.createTransport({
  host: 'mail.botsub.com.ng', // Replace with your SMTP server hostname
  port: 465, // Port number for SMTP (e.g., 587 for TLS)
  secure: true, // Set to true if using SSL
  auth: {
    user: process.env.ADMIN_MAIL,
    pass: process.env.ADMIN_MAIL_P,
  },
}); // end of transporter


// function to initiate delvering of values 
function deliverValue(response, req, res, requirementMet) {
  if (requirementMet.type === 'data') {
    return deliverData(response, req, res);
  } else if (requirementMet.type === 'airtime') {
    return deliverAirtime(response, req, res);
  };
};


// function to make data purchase request
async function deliverData(response, req, res) {
  let options = {
    method: 'POST',
    url: 'https://opendatasub.com/api/data/',
    headers: {
      Authorization: 'Token ' + process.env.OPENSUB_KEY,
      'Content-Type': 'application/json',
    },
    body: {
      network: Number(response.data.meta.networkID),
      mobile_number: response.data.meta.number,
      plan: Number(response.data.meta.planID),
      Ported_number: true,
    },
    json: true,
  };

  if (process.env.NODE_ENV === 'production') {
    makePurchaseRequest(response, res, req, options);
  } else {
    simulateMakePurchaseRequest(response, res, req, true);
  };
}; // end of deliver value function


// function to make airtime purchase request
function deliverAirtime(response, req, res) {
  let options = {
    method: 'POST',
    url: 'https://opendatasub.com/api/topup/',
    headers: {
      Authorization: 'Token ' + process.env.OPENSUB_KEY,
      'Content-Type': 'application/json',
    },
    body: {
      network: Number(response.data.meta.networkID),
      amount: Number(response.data.meta.amount),
      mobile_number: response.data.meta.number,
      Ported_number: true,
      airtime_type: 'VTU',
    },
    json: true,
  };

  if (process.env.NODE_ENV === 'production') {
    makePurchaseRequest(response, req, res, options);
  } else {
    simulateMakePurchaseRequest(response, res, req, true);
  };
}; // end of deliverAirtime


// function to make product purchase request
async function makePurchaseRequest(response, res, req, options) {
  try {
    request(options, async (error, _, body) => {
      if (error) {
        throw error
      };
      console.log('data purchase resp body: ', body);
      // to do dependent transaction status
      if (body.Status === 'successful') {
        consle.log('in succesfull make purchase request');
        return helpSuccesfulDelivery(req, res, response, b)
      };
      throw 'product purchas request not successful';
    });
  } catch(error) {
    console.log('n make purchase request failed in cacth error block:', error);
    helpFailedDelivery(req, res, response);
  };
}; // end of actualBuyData


// function to make product purchase request simulation
async function simulateMakePurchaseRequest(response, res, req, condition=false) {
  try {
    if (condition) {
      return helpSuccesfulDelivery(req, res, response, {balance_after: 6000})
    };
    throw 'product purchas request not successful';
  } catch(error) {
    console.log('make purchase request simulation failed in cacth error block:', error);
    helpFailedDelivery(req, res, response);
  };
}; // end of makePurchaserequest simulain


// helper function for succesfull response
async function helpSuccesfulDelivery(req, res, response, body) {
  addToDelivered(req);
  // calling function to send mail and json response object
  sendSuccessfulResponse(response, res);

  if (response.data.meta.bot) {
    const date = new Date() //new Date(response.data.customer.created_at);
    const nigeriaTimeString = dateFormatter(date);

    await sendMessage(response.data.meta.senderId, {
      text: `Transaction Succesful \nProduct: ${product(response)}\nTransaction ID: ${response.data.id} \nDate: ${nigeriaTimeString}`,
    });
  };
  if (parseInt(body.balance_after) <= 5000) fundWallet('035', process.env.WALLET_ACC_NUMBER, parseInt(process.env.WALLET_TOPUP_AMOUNT));
}; // end of helpSuccesfulDelivery


// helper function  for failed delivery
async function helpFailedDelivery(req, res, response) {
  addToFailedToDeliver(req);
  sendFailedToDeliverResponse(response, res);

  if (response.data.meta.bot) {
    const date = new Date() //new Date(response.data.customer.created_at);
    const nigeriaTimeString = dateFormatter(date);

    console.log('bot feed back');
    await sendMessage(response.data.meta.senderId, {
      text: `Sorry your transaction is pending \nProduct: ${product(response)} data \nTransaction ID: ${response.data.id} \nDate: ${nigeriaTimeString}`,
    });
    await sendTemplate(
      response.data.meta.senderId,
      retryFailedTemplate(req.query.transaction_id, req.query.tx_ref)
    );
  };
}; // end of failed delivery hwelper


// function to add transaction to delivered transaction
async function addToDelivered(req, response) {
  const transaction = await Transactions.findOne({ id: req.query.transaction_id })
  if (transaction) {
    if (transaction.status === true) return;
    const response = transaction.updateOne({ status: true });
    return response;
  };

  let product = `${response.data.meta.size} data`;
  if (response.data.meta.type === 'airtime') product = `₦${response.data.meta.amount} airtime`;

  newTransaction = new Transactions({
    id: req.query.transaction_id,
    email: response.data.customer.email,
    txRef: req.query.tx_ref,
    status: true,
    date: Date(),
    product: product + ' ' + response.data.meta.network,
    beneficiary: parseInt(response.data.meta.number)
  });
  const response2 = await newTransaction.save()

  console.log('add to delivered response', response2);
  return responseServices2;
}; // end of addToDelivered


// function to add transaction to failed to deliver
async function addToFailedToDeliver(req, response) {
  try {
    let transaction = await Transactions.findOne({ id: req.query.transaction_id })
    if (transaction) return console.log('failed transaction already exists', transaction);

    let product = `${response.data.meta.size} data`;
    if (response.data.meta.type === 'airtime') product = `₦${response.data.meta.amount} airtime`;

    newTransaction = new Transactions({
      id: req.query.transaction_id,
      email: response.data.customer.email,
      txRef: req.query.tx_ref,
      status: false,
      date: Date(),
      product: product + ' ' + response.data.meta.network,
      beneficiary: parseInt(response.data.meta.number)
    });

    response2 = await newTransaction.save();

    console.log('add to failed delivery response', response2);
    return response2;
  } catch (err) { console.log('error occured while adding new trnasaction to databasae', err) };
}; // end if add to failed to deliver



// helper function to form product
function product(response) {
  let product = `${response.data.meta.size}  ${response.data.meta.network} data`;

  if (response.data.meta.type === 'airtime') {
    product = `₦${response.data.meta.amount} ${response.data.meta.network} airtime`;
  };
  return product
}; // end of procuct

// function to send data purchase mail and response
async function sendSuccessfulResponse(response, res) {
  try {
    const successfulMailTemplate = await fsP.readFile(
      'modules/email-templates/successful-delivery.html',
      'utf8'
    );
    const compiledSuccessfulMailTemplate = handlebars.compile(successfulMailTemplate);
    let details = formResponse(response);
    details.product = product(response);
    const mailParams = {
      product: details.product,
      network: details.network,
      date: details.date,
      id: response.data.id,
      txRef: response.data.tx_ref,
      status: 'Successfull',
      price: response.data.amount,
      recipientNumber: details.number,
      chatBotUrl: process.env.CHATBOT_URL,
      host: process.env.HOST,
    };

    const mailOptions = {
      from: process.env.ADMIN_MAIL,
      to: response.data.customer.email,
      subject: 'BotSub Receipt',
      html: compiledSuccessfulMailTemplate(mailParams),
    };

    //const resp = await transporter.sendMail(mailOptions);

    //console.log('successful delivery function', resp);
    console.log('in sucess');
    return res.json({ status: 'successful', data: details });
  } catch (err) {
    console.log('send successful vtu response error', err);
    return res.json({ status: 'error', message: 'error sending succesfull response', data: err });
  };
}; // end of sendAirtimeResponse function



// function to form response on failed to deliver
async function sendFailedToDeliverResponse(response, res) {
  try {
    const pendingMailTemplate = await fsP.readFile(
      'modules/email-templates/failed-delivery.html',
      'utf8'
    );
    const compiledPendingMailTemplate = handlebars.compile(pendingMailTemplate);
    let details = formResponse(response);
    details.product = `${response.data.meta.size} data`;

    if (response.data.meta.type === 'airtime') {
      details.product = `₦${response.data.meta.amount} airtime`;
    };

    const mailParams = {
      product: details.product,
      network: details.network,
      date: details.date,
      id: response.data.id,
      txRef: response.data.tx_ref,
      status: 'Pending',
      price: response.data.amount,
      recipientNumber: details.number,
      chatBotUrl: process.env.CHATBOT_URL,
      host: process.env.HOST,
    };
    const mailOptions = {
      from: process.env.ADMIN_MAIL,
      to: response.data.customer.email,
      subject: 'BotSub Pending Transaction',
      html: compiledPendingMailTemplate(mailParams),
    };

    //const resp = await transporter.sendMail(mailOptions);

    //sconsole.log('in failed to deliver function', resp);
    return res.json({ status: 'pending', data: details });
  } catch (err) {
    console.log('send successful vtu response error', err);
    return res.json({ status: 'error', message: 'send failed response error air', data: err });
    //return res.json({ status: 'failedDelivery', message: 'failed to deliver purchased product' });
  };
}; // end of sendFailedToDeliverResponse



//function to form response for request
function formResponse(response) {
  const meta = response.data.meta;
  // create a Date object with the UTC time
  const date = new Date(response.data.customer.created_at);
  const nigeriaTimeString = dateFormatter(date);

  const details = {
    network: meta.network,
    number: meta.number,
    email: response.data.customer.email,
    date: nigeriaTimeString,
  };
  return details;
}; // end of formResponse

module.exports = deliverValue;