var config = require('./config');
var logger = require('./logger');
const AWS = require('aws-sdk');
var ses = new AWS.SES({
    apiVersion: "2010-12-01"
});
function sendTemplateEmail(emailAddress, userId, token, txResp, xrpAddress, purpose, callback) {
	var eparam = {};
	if (purpose === "welcome") {
		eparam = {
			Destination: {
			ToAddresses: [emailAddress]
			},
			Source: "XRP Balance<" + config.adminEmail + ">",
			Template: "WelcomeEmail",
			TemplateData: "{ \"baseURL\":\"" +config.baseURL + "\", \"userId\":\"" + userId + "\" }",
			ReplyToAddresses: [config.adminEmail],
			ReturnPath: config.adminEmail
		};
	} else if (purpose === "verification") {
		eparam = {
			Destination: {
			ToAddresses: [emailAddress]
			},
			Source: "XRP Balance<" + config.adminEmail + ">",
			Template: "VerificationEmail",
			TemplateData: "{ \"baseURL\":\"" +config.baseURL + "\", \"token\":\"" + token + "\" }",
			ReplyToAddresses: [config.adminEmail],
			ReturnPath: config.adminEmail
		};
	} else if (purpose === "updateEmail") {
		eparam = {
			Destination: {
			ToAddresses: [emailAddress]
			},
			Source: "XRP Balance<" + config.adminEmail + ">",
			Template: "UpdateEmailEmail",
			TemplateData: "{ \"baseURL\":\"" +config.baseURL + "\", \"token\":\"" + token + "\" }",
			ReplyToAddresses: [config.adminEmail],
			ReturnPath: config.adminEmail
		};
	} else if (purpose === "payment") {
		var originAddress = txResp.Account;
		var destinationAddress = txResp.Destination;
		var amount = parseInt(txResp.Amount)/1000000;
		var fee = parseInt(txResp.Fee)/1000000;
		var currency = "XRP";	// default
		if (typeof txResp.Amount.currency !== 'undefined' && txResp.Amount.currency !== null) {
			currency = txResp.Amount.currency;
			amount = txResp.Amount.value;
		}
		var transactionType = txResp.TransactionType;
		var destinationTag = txResp.DestinationTag;
		if (typeof destinationTag == 'undefined') {
			destinationTag = "-";
		}
		var hash = txResp.hash;
		var xrpChartLink = "https://xrpcharts.ripple.com/#/transactions/" + hash;

		eparam = {
			Destination: {
			ToAddresses: [emailAddress]
			},
			Source: "XRP Balance<" + config.adminEmail + ">",
			Template: "PaymentEmail",
			TemplateData: "{ \"baseURL\":\"" +config.baseURL + "\", \"xrpAddress\":\"" + xrpAddress + "\", \"originAddress\":\"" + originAddress + "\", \"destinationAddress\":\"" + destinationAddress + "\", \"destinationTag\":\"" + destinationTag + "\", \"amount\":\"" + amount + "\", \"currency\":\"" + currency + "\", \"fee\":\"" + fee + "\", \"transactionType\":\"" + transactionType + "\", \"hash\":\"" + hash + "\", \"xrpChartLink\":\"" + xrpChartLink + "\", \"userId\":\"" + userId + "\" }",
			ReplyToAddresses: [config.adminEmail],
			ReturnPath: config.adminEmail
		};
	} else if (purpose == "paymentChannelClaim") {
		var finalBalance= parseInt(txResp.meta.AffectedNodes[1].ModifiedNode.FinalFields.Balance)/1000000;
		var previousBalance = parseInt(txResp.meta.AffectedNodes[1].ModifiedNode.PreviousFields.Balance)/1000000;
		var amount = finalBalance - previousBalance;
		var fee = parseInt(txResp.Fee)/1000000;
		var currency = "XRP";	// default
		var transactionType = txResp.TransactionType;
		var hash = txResp.hash;
		var xrpChartLink = "https://xrpcharts.ripple.com/#/transactions/" + hash;

		eparam = {
			Destination: {
			ToAddresses: [emailAddress]
			},
			Source: "XRP Balance<" + config.adminEmail + ">",
			Template: "PaymentChannelClaimEmail",
			TemplateData: "{ \"baseURL\":\"" +config.baseURL + "\", \"xrpAddress\":\"" + xrpAddress + "\", \"balance\":\"" + finalBalance + "\", \"amount\":\"" + amount + "\", \"currency\":\"" + currency + "\", \"fee\":\"" + fee + "\", \"transactionType\":\"" + transactionType + "\", \"hash\":\"" + hash + "\", \"xrpChartLink\":\"" + xrpChartLink + "\" }",
			ReplyToAddresses: [config.adminEmail],
			ReturnPath: config.adminEmail
		};
	}

	ses.sendTemplatedEmail(eparam, function(err, data) {
        if (err) {
			logger.errorLog.error("[Email " + purpose +"] Error sending email to: [Email]: " + emailAddress + " [Error message]: " + err + " [Context]: " +data);
			callback(err);
		} else {
			logger.accessLog.info("[Email " + purpose +"] Successfully sent email to: [Email]: " + emailAddress);
			callback(null, data);
		}
    });
}
module.exports.sendTemplateEmail = sendTemplateEmail;
