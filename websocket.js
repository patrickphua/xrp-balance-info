var config = require('./config');
const RippledWsClient = require('rippled-ws-client');
const db = require('./dbOperations');
const util = require('./util');
var logger = require('./logger');

new RippledWsClient(config.rippledServer).then((Connection) => {
    logger.accessLog.info("[Websocket] Connected to " + config.rippledServer);

	// init setup - restore subscriptions through db
	db.getAllXRPAddresses(function(err, allXRPAddresses) {	// get all XRP addresses
		if (err) {
		} else {
			if (allXRPAddresses && allXRPAddresses.length > 0) {
				// subscribe
				let subMethod = "subscribe";
				sendSub(Connection, subMethod, allXRPAddresses, function(err, result) {});
			}
		}
	});

	//process  subscription and unsub requests every min
	setInterval(() => {
		getNewSubRequest(Connection);
		getNewUnsubRequest(Connection);
	}, 60000)


    // transaction stream
    Connection.on('transaction', (transaction) => {

        // get transaction hash
        var transactionHash = transaction.transaction.hash;

		// get info on transaction
        Connection.send({
            command: 'tx',
            transaction: transactionHash
        }).then((txResp) => {
			var transactionType = txResp.TransactionType;
			if (transactionType == "Payment") {
				var originAddress = txResp.Account;
				var destinationAddress = txResp.Destination;

				// get subscribers list based on originating address
				db.getEmailListFromSubList(txResp.Account, function(err, originatingEmailList) {
					if (err) {
						logger.errorLog.error("[Get Email List from Sublist] Error getting email for [TX RESP]: " + JSON.stringify(txResp));
					} else {
						if (originatingEmailList) {
							originatingEmailList.forEach(function(emailList) {
								var emailAddress = emailList.S;
								// check if user exists - potentially costly operator
//								db.isUserExists(emailAddress, function(err, userId) {
//									if (userId) {
										util.sendTemplateEmail(emailAddress, null, null, txResp, originAddress, "payment", function(err, data) {
											if (err) {
												logger.errorLog.error("[Email Notification] Error sending email to: [Email]: " + emailAddress + " for [Txn Hash]: " + transactionHash + " [Error message]: " + err);
											}
										});
//									}
//								});
							});
						}
					}
				});
				// get subscribers list based on destination address
				db.getEmailListFromSubList(txResp.Destination, function(err, destinationEmailList) {
					if (err) {
						logger.errorLog.error("[Get Email List from Sublist] Error getting email for [TX RESP]: " + JSON.stringify(txResp));
					} else {
						if (destinationEmailList) {
							destinationEmailList.forEach(function(emailList) {
								var emailAddress = emailList.S;
								// check if user exists - potentially costly operator
//								db.isUserExists(emailAddress, function(err, userId) {
//									if (userId) {
										util.sendTemplateEmail(emailAddress, null, null, txResp, destinationAddress, "payment", function(err, data) {
											if (err) {
												logger.errorLog.error("[Email Notification] Error sending email to: [Email]: " + emailAddress + " for [Txn Hash]: " + transactionHash + " [Error message]: " + err);
											}
										});
//									}
//								});
							});
						}
					}
				});
			}
        }).catch((e) => {
			logger.errorLog.error("[Ripple Error Event] Caught an error [Error message]: " + e.stack);
        });
    });

    // error stream
    Connection.on('error', (error) => {
		logger.errorLog.error("[Ripple Error Event] Caught an error [Error message]: " + error.stack);
    });

}).catch((err) => {
	logger.errorLog.error("[Websocket] Cannot connect to " + config.rippledServer);
});

// subscribe to stream
function sendSub(Connection, subMethod, xrpAddresses, callback) {
    // send subscribe or unsubscribe message
    Connection.send({
        command: subMethod,
        accounts: xrpAddresses
    }).then((r) => {
		if (r.error) {
			logger.errorLog.error("[Ripple " + subMethod + "] Error " + subMethod + " to [XRP Addresses]: " + xrpAddresses + " [Error message]: " + JSON.stringify(r));
			callback(true, xrpAddresses);
		} else {
			logger.accessLog.info("[Ripple " + subMethod + "] Successfully " + subMethod + " to [XRP Addresses]: " + xrpAddresses);
			callback(null, xrpAddresses);
		}
    }).catch((e) => {
        logger.errorLog.error("[Ripple " + subMethod + "] Error " + subMethod + " to [XRP Addresses]: " + xrpAddresses + " [Error message]: " + e);
    });
}

// get subscription requests, do sendSub(subscribe), delete from request table, add to sub table
function getNewSubRequest(Connection) {
	db.getItemsSubRequest(function(err, items) {	// get all items on subscription request table
		if (err) {
		} else {
			if (items && items.length > 0) {
				// subscribe all of them
				var listOfAddress = [];
				items.forEach(function(element, index, array) {
					listOfAddress.push(element.Address.S);
				});
				let subMethod = "subscribe";
				sendSub(Connection, subMethod, listOfAddress, function(err, result) {
					if (err) {
						logger.errorLog.error("[Ripple Subscribe for new subscriptions] Error handling new subscription: [Email]: " + listOfAddress + " [Error message]: " + err);
					} else {	// only do DB operation when subscription is done
						items.forEach(function(element, index, array) {
							db.deleteItemSubRequest(element.Address.S, element.Email.S);
							db.addItemSubList(element.Address.S, element.Email.S);
						});
					}
				});
			}
		}
	});
}

// get unsubscribe requests, remove from sub table, if no other email subscribed to the address, do sendSub(unsubscribe), delete from request table
function getNewUnsubRequest(Connection) {
	db.getItemsUnsubRequest(function(err, items) {	// get all items on unsubscription request table
		if (err) {
		} else {
			if (items && items.length > 0) {
				// get actual address list to unsubscribe
				getListOfAddressToUnsubscribe(items, function(listOfAddressToUnsubscribe) {
					if (listOfAddressToUnsubscribe.length > 0) {
						sendSub(Connection, "unsubscribe", listOfAddressToUnsubscribe, function(err, result) {
							if (err) {
								logger.errorLog.error("[Ripple Unsubscribe for new un-subscriptions] Error handling new un-subscription: [XRP Addresses]: " + listOfAddressToUnsubscribe + " [Error message]: " + err);
							} else {
								logger.accessLog.info("[Ripple Unsubscribe for new un-subscriptions] Successfully unsubscribed: [XRP Addresses]: " + listOfAddressToUnsubscribe);
							}
						});
					}
				});
			}
		}
	});
}

// remove unsubscribe requests from table, remove email from sub list of the address, if it's the last email in sub list, add to listOfAddressToUnsubscribe and return
function getListOfAddressToUnsubscribe(items, callback) {
	var listOfAddressToUnsubscribe = [];
	var itemsProcessed = 0;
	items.forEach(function(element, index, array) {
		// remove from request table
		db.deleteItemUnsubRequest(element.Address.S, element.Email.S);
		// remove from sub table, if return is "deleted",
		db.deleteItemSubList(element.Address.S, element.Email.S, function(err, result) {
			itemsProcessed++;
			if (err) {
			} else {
				if (result === "deleted") {	// if address is deleted from sublist, go ahead and add it to listOfAddressToUnsubscribe
					listOfAddressToUnsubscribe.push(element.Address.S);
				}
			}
			if(itemsProcessed  === items.length) {
				callback(listOfAddressToUnsubscribe);
			}
		});
	});
}
