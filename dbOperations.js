var config = require('./config');
var logger = require('./logger');
const AWS = require('aws-sdk');
AWS.config.update({
    region: config.dynamoDBRegion
});

var dynamodb = new AWS.DynamoDB();

// ===== SUB LIST TABLE ====
// add item to DB. If exist, append email to list.
function addItemSubList(xrpAddress, emailAddress) {
    // find if address exists
    var params = {
        Key: {
            "Address": {
                S: xrpAddress
            }
        },
        TableName: config.tableName
    };
    dynamodb.getItem(params, function(err, data) {
        if (err) {
            logger.errorLog.error("[Sub List DB Query] Error on addItemSubList for [Email]: " + emailAddress + " [XRP Address]: " + xrpAddress + " [Error Message]:" + err.stack);
        } else {
            if (data && JSON.stringify(data) === '{}') {
                // empty set, add new addres to db and set the email as first on the email list
                var params = {
                    Item: {
                        "Address": {
                            S: xrpAddress
                        },
                        "Emails": {
                            L: [{
                                S: emailAddress
                            }]
                        }
                    },
                    ReturnConsumedCapacity: "TOTAL",
                    TableName: config.tableName
                };
                dynamodb.putItem(params, function(err, data) {
                    if (err) {
                        logger.errorLog.error("[Sub List DB insert] Error adding new row for [Email]: " + emailAddress + " to [XRP Address]: " + xrpAddress + " [Error Message]:" + err.stack);
                    } else {
                        logger.accessLog.info("[Sub List DB insert] Successfully added new row for [Email]: " + emailAddress + " to [XRP Address]: " + xrpAddress);
                    }
                });

            } else {
                // if email does not exist in list, update the list
                let emailList = data.Item.Emails.L;
                if (JSON.stringify(emailList).indexOf(emailAddress) < 0) { // MIGHT HAVE PROBLEM WITH SAME SUBSTRINGS
                    // add to list
                    let newEmail = {
                        "S": emailAddress
                    }
                    emailList.push(newEmail);

                    // update
                    var params = {
                        ExpressionAttributeNames: {
                            "#E": "Emails"
                        },
                        ExpressionAttributeValues: {
                            ":e": {
                                L: emailList
                            }
                        },
                        Key: {
                            "Address": {
                                S: xrpAddress
                            }
                        },
                        ReturnValues: "ALL_NEW",
                        TableName: config.tableName,
                        UpdateExpression: "SET #E = :e"
                    };
                    dynamodb.updateItem(params, function(err, data) {
                        if (err) {
                            logger.errorLog.error("[Sub List DB update] Error adding [Email]: " + emailAddress + " to emailList for [XRP Address]: " + xrpAddress + " [Error Message]:" + err.stack);
                        } else {
                            logger.accessLog.info("[Sub List DB update] Successfully added [Email]: " + emailAddress + " to emailList for [XRP Address]: " + xrpAddress);
                        }
                    });
                } else {
					logger.accessLog.info("[Sub List DB update] Do nothing. Email already exists for XRP address. [Email]: " + emailAddress + " [XRP Address]: " + xrpAddress);
				}
            }
        }
    });
}
module.exports.addItemSubList = addItemSubList;

// remove item from DB. If only 1 email, remove entry
function deleteItemSubList(xrpAddress, emailAddress, callback) {
var params = {
        Key: {
            "Address": {
                S: xrpAddress
            }
        },
        TableName: config.tableName
    };
    dynamodb.getItem(params, function(err, data) {
		if (err) {
            logger.errorLog.error("[Sub List DB delete] Error getting items in deleteItemSubList for [Email]: " + emailAddress + " [XRP Address]: " + xrpAddress + " [Error Message]:" + err.stack);
			callback(err.stack);
        } else {
            if (data && JSON.stringify(data) !== '{}') {	// sanity check for non empty
				let emailList = data.Item.Emails.L;
				var index = emailList.findIndex(function(item, i){	// get array index of email
				  	return item.S === emailAddress;
				});

				if (index > -1) {	// if email is found in list
					if (emailList.length === 1) {	// if it's the only one left, remove it
						var params = {
							Key: {
								"Address": {
									S: xrpAddress
								}
							},
        					TableName: config.tableName
						};
						dynamodb.deleteItem(params, function(err, data) {
							if (err) {
								logger.errorLog.error("[Sub List DB delete] Error removing [XRP Address]: " + xrpAddress + " [Error Message]:" + err.stack);
								callback(err.stack);
							} else {
								logger.accessLog.info("[Sub List DB delete] Successfully removed [XRP Address]: " + xrpAddress);
								callback(null, "deleted");
							}
						});
					} else {	// just remove the email from list
						// update
						var params = {
							ExpressionAttributeNames: {
								"#E": "Emails"
							},
							Key: {
								"Address": {
									S: xrpAddress
								}
							},
							ReturnValues: "ALL_NEW",
							TableName: config.tableName,
							UpdateExpression: "REMOVE #E["+index+"]"
						};
						dynamodb.updateItem(params, function(err, data) {
							if (err) {
								logger.errorLog.error("[Sub List DB update] Error removing [Email]: " + emailAddress + " from [XRP Address]: " + xrpAddress + " [Error Message]:" + err.stack);
								callback(err.stack);
							} else {
								logger.accessLog.info("[Sub List DB update] Successfully removed [Email]: " + emailAddress + " from [XRP Address]: " + xrpAddress);
								callback(null, "removed");
							}
						});
					}
				}
            }
        }
	});
}
module.exports.deleteItemSubList = deleteItemSubList;

// query emails based on XRP address
function getEmailListFromSubList(xrpAddress, callback) {
    var params = {
        ExpressionAttributeValues: {
            ":ad": {
                S: xrpAddress
            }
        },
        KeyConditionExpression: "Address = :ad",
        ProjectionExpression: "Emails",
        TableName: config.tableName
    };
    dynamodb.query(params, function(err, data) {
        if (err) {
            logger.errorLog.error("[Sub List DB Query] Error retriving emails subscribed to [XRP Address]: " + xrpAddress + " [Error Message]:" + err.stack);
			callback(err);
        } else {
            data.Items.forEach(function(element, index, array) {	// only first entry
                logger.accessLog.info("[Sub List DB Query] Successfully retrieved emails subscribed to [XRP Address]: " + xrpAddress);
                callback(null, element.Emails.L);
            });
        }
    });
}
module.exports.getEmailListFromSubList = getEmailListFromSubList;

// scan for all XRP addresses in subscription list
function getAllXRPAddresses(callback) {
	var params = {
		ProjectionExpression: "Address",
		TableName: config.tableName
	};
	dynamodb.scan(params, function(err, data) {
		if (err)  {
			logger.errorLog.error("[DB Get All XRP Addresses]: [Error Message]:" + err.stack);
			callback(err);
		} else {
			var listOfAddresses = [];
			data.Items.forEach(function(element, index, array) {
				listOfAddresses.push(element.Address.S);
			});
			logger.accessLog.info("[DB Get All XRP Addresses]: Successfully retrieved all XRP addresses [Total count]: " + listOfAddresses.length);
			callback(null, listOfAddresses);
		}
	});
}
module.exports.getAllXRPAddresses = getAllXRPAddresses;

// scan addresses based on email
function getXRPAddressesFromEmail(emailAddress, callback) {
	var params = {
		ExpressionAttributeValues: {
			":em": {
				S: emailAddress
			}
		},
		FilterExpression: "contains (Emails, :em)",
		ProjectionExpression: "Address",
		TableName: config.tableName
	};
	dynamodb.scan(params, function(err, data) {
		if (err)  {
			logger.errorLog.error("[DB Get XRP Addresses based on email]: [Email]: " + emailAddress + " [Error Message]:" + err.stack);
		} else {
			var listOfAddresses = [];
			data.Items.forEach(function(element, index, array) {
				listOfAddresses.push(element.Address.S);
			});
			logger.accessLog.info("[DB Get XRP Addresses based on email]: Successfully retrieved all XRP addresses for [Email]: " + emailAddress + " [XRP Addresses]: "+ listOfAddresses.toString());
			callback(listOfAddresses);
		}
	});
}
module.exports.getXRPAddressesFromEmail = getXRPAddressesFromEmail;

// check if XRP address exists (already subscribed)
function isXRPAddressExistSubList(xrpAddress, callback) {
    var params = {
        Key: {
            "Address": {
                S: xrpAddress
            }
        },
        TableName: config.tableName
    };
    dynamodb.getItem(params, function(err, data) {
		callback(JSON.stringify(data) !== '{}');
	});
}
module.exports.isXRPAddressExistSubList = isXRPAddressExistSubList;

// ===== SUB REQUEST TABLE ====
function addItemSubRequest(xrpAddress, emailAddress) {

	var params = {
		Item: {
			"Address": {
				S: xrpAddress
			},
			"Email": {
				S: emailAddress
			}
		},
		ReturnConsumedCapacity: "TOTAL",
		TableName: config.subRequestTableName
	};
	dynamodb.putItem(params, function(err, data) {
		if (err) {
			logger.errorLog.error("[Sub Request DB insert] Error adding subscription request for [Email]: " + emailAddress + " [XRP Address]: " + xrpAddress + " [Error Message]:" + err.stack);
		} else {
			logger.accessLog.info("[Sub Request DB insert] Successfully added subscription request for [Email]: " + emailAddress + " [XRP Address]: " + xrpAddress);
		}
	});
}
module.exports.addItemSubRequest = addItemSubRequest;

function getItemsSubRequest(callback) {
	var params = {
		ProjectionExpression: "Address, Email",
		TableName: config.subRequestTableName
	};
	dynamodb.scan(params, function(err, data) {
		if (err)  {
			logger.errorLog.error("[Sub Request DB Get all items]: [Error Message]:" + err.stack);
			callback(err);
		} else {
			var items = [];
			items = items.concat(data.Items);
			if (items.length > 0) {
				logger.accessLog.info("[Sub Request DB Get all items]: Successfully retrieved all sub requests [Total count]: " + items.length);
			}
			callback(null, items);
		}
	});
}
module.exports.getItemsSubRequest = getItemsSubRequest;

function getItemsSubRequestByEmail(emailAddress, callback) {
	var params = {
		ExpressionAttributeValues: {
			":em": {
				S: emailAddress
			}
		},
		FilterExpression: "Email=:em",
		ProjectionExpression: "Address",
		TableName: config.subRequestTableName
	};
	dynamodb.scan(params, function(err, data) {
		if (err)  {
			logger.errorLog.error("[Sub Request DB Get XRP Addresses based on email]: [Email]: " + emailAddress + " [Error Message]:" + err.stack);
		} else {
			var listOfAddresses = [];
			data.Items.forEach(function(element, index, array) {
				listOfAddresses.push(element.Address.S);
			});
			logger.accessLog.info("[Sub Request DB Get XRP Addresses based on email]: Successfully retrieved all XRP addresses for [Email]: " + emailAddress + " [XRP Addresses]: "+ listOfAddresses.toString());
			callback(listOfAddresses);
		}
	});
}
module.exports.getItemsSubRequestByEmail = getItemsSubRequestByEmail;

function deleteItemSubRequest(xrpAddress, emailAddress) {
	var params = {
		Key: {
			"Address": {
				S: xrpAddress
			},
			"Email": {
				S: emailAddress
			}
		},
		TableName: config.subRequestTableName
	};
	dynamodb.deleteItem(params, function(err, data) {
		if (err)  {
			logger.errorLog.error("[Sub Request DB Delete items]: Error removing subscription request for [Email]: " + emailAddress + " [XRP Address]: " + xrpAddress + " [Error Message]:" + err.stack);
		} else {
			logger.accessLog.info("[Sub Request DB Delete items]: Successfully removed subscription request for [Email]: " + emailAddress + " [XRP Address]: " + xrpAddress);
		}
	});
}
module.exports.deleteItemSubRequest = deleteItemSubRequest;

// ===== UNSUB REQUEST TABLE ====
function addItemUnsubRequest(xrpAddress, emailAddress) {

	var params = {
		Item: {
			"Address": {
				S: xrpAddress
			},
			"Email": {
				S: emailAddress
			}
		},
		ReturnConsumedCapacity: "TOTAL",
		TableName: config.unsubRequestTableName
	};
	dynamodb.putItem(params, function(err, data) {
		if (err) {
			logger.errorLog.error("[Unsub Request DB insert] Error adding unsubscribe request for [Email]: " + emailAddress + " [XRP Address]: " + xrpAddress + " [Error Message]:" + err.stack);
		} else {
			logger.accessLog.info("[Unsub Request DB insert] Successfully added unsubscribe request for [Email]: " + emailAddress + " [XRP Address]: " + xrpAddress);
		}
	});
}
module.exports.addItemUnsubRequest = addItemUnsubRequest;

function getItemsUnsubRequest(callback) {
	var params = {
		ProjectionExpression: "Address, Email",
		TableName: config.unsubRequestTableName
	};
	dynamodb.scan(params, function(err, data) {
		if (err)  {
			logger.errorLog.error("[Unsub Request DB Get all items]: [Error Message]:" + err.stack);
			callback(err);
		} else {
			var items = [];
			items = items.concat(data.Items);
			if (items.length > 0) {
				logger.accessLog.info("[Unsub Request DB Get all items]: Successfully retrieved all unsubscribe requests [Total count]: " + items.length);
			}
			callback(null, items);
		}
	});
}
module.exports.getItemsUnsubRequest = getItemsUnsubRequest;

function deleteItemUnsubRequest(xrpAddress, emailAddress) {
	var params = {
		Key: {
			"Address": {
				S: xrpAddress
			},
			"Email": {
				S: emailAddress
			}
		},
		TableName: config.unsubRequestTableName
	};
	dynamodb.deleteItem(params, function(err, data) {
		if (err)  {
			logger.errorLog.error("[Unsub Request DB Delete items]: Error removing unsubscribe request for [Email]: " + emailAddress + " [XRP Address]: " + xrpAddress + " [Error Message]:" + err.stack);
		} else {
			var items = [];
			items = items.concat(data.Items);
			logger.accessLog.info("[Unsub Request DB Delete items]: Successfully removed unsubscribe request for [Email]: " + emailAddress + " [XRP Address]: " + xrpAddress);
		}
	});
}
module.exports.deleteItemUnsubRequest = deleteItemUnsubRequest;

// ===== USER TABLE ====
function addUser(userId, emailAddress, callback) {
	var params = {
		Item: {
			"UserId": {
				S: userId
			},
			"Email": {
				S: emailAddress
			}
		},
		ReturnConsumedCapacity: "TOTAL",
		TableName: config.userTableName
	};
	dynamodb.putItem(params, function(err, data) {
		if (err) {
			logger.errorLog.error("[DB insert]: Error adding user for [UserId]: " + userId + " [Email]: " + emailAddress + " [Error Message]:" + err.stack);
			callback(err, userId);
		} else {
			logger.accessLog.info("[DB insert]: Successfully added user for [UserId]: " + userId + " [Email]: " + emailAddress);
			callback(null, userId);
		}
	});
}
module.exports.addUser = addUser;

function getUser(userId, callback) {
    var params = {
        Key: {
            "UserId": {
                S: userId
            }
        },
        TableName: config.userTableName
    };
    dynamodb.getItem(params, function(err, data) {
		if (err) {
			logger.errorLog.error("[DB Get user]: Error getting user for [UserId]: " + userId + " [Error Message]:" + err.stack);
			callback(err)
		} else {
			logger.accessLog.info("[DB Get user]: Successfully retrieve email for [UserId]: " + userId + " [UserInfo]: " + JSON.stringify(data));
			callback(null, data);
		}
	});
}
module.exports.getUser = getUser;

function getUserId(emailAddress, callback) {
	var params = {
		ExpressionAttributeValues: {
			":em": {
				S: emailAddress
			}
		},
		FilterExpression: "Email=:em",
		ProjectionExpression: "UserId",
		TableName: config.userTableName
	};
	dynamodb.scan(params, function(err, data) {
		if (err)  {
			logger.errorLog.error("[DB Get userId]: Error getting userId for [Email]: " + emailAddress + " [Error Message]:" + err.stack);
			callback(err);
		} else {
			if (typeof data.Items[0] === "undefined" || data.Items[0] === null) {
				callback(null, null);
			} else {
				var userId = data.Items[0].UserId.S;
				logger.accessLog.info("[DB Get userId]: Successfully retrieve [UserId]: " + userId + " for [Email]: " + emailAddress);
				callback(null, userId);
			}
		}
	});
}
module.exports.getUserId = getUserId;

function isUserExists(emailAddress, callback) {
	var params = {
		ExpressionAttributeValues: {
			":em": {
				S: emailAddress
			}
		},
		FilterExpression: "Email = :em",
		ProjectionExpression: "UserId",
		TableName: config.userTableName
	};
	dynamodb.scan(params, function(err, data) {
		if (err)  {
			logger.errorLog.error("[DB Scan - isUserExists]: [Error Message]:" + err.stack);
			callback(err);
		} else {
			var items = [];
			items = items.concat(data.Items);
			if (items.length === 0) {
				logger.accessLog.info("[DB Scan - isUserExists]: User is not found for [Email]: " + emailAddress + " in user table");
				callback(null, null);
			} else {
				logger.accessLog.info("[DB Scan - isUserExists]: Successfully found [Email]: " + emailAddress + " in user table [UserId]: " + items[0].UserId.S);
				callback(null, items[0].UserId.S);
			}
		}
	});
}
module.exports.isUserExists = isUserExists;

function deleteUser(userId, emailAddress, callback) {
	// removing user subscription
	var params = {
		ExpressionAttributeValues: {
			":em": {
				S: emailAddress
			}
		},
		FilterExpression: "contains (Emails, :em)",
		ProjectionExpression: "Address",
		TableName: config.tableName
	};
	dynamodb.scan(params, function(err, data) {
		if (err)  {
			logger.errorLog.error("[DB Get XRP Addresses based on email]: [Email]: " + emailAddress + " [Error Message]:" + err.stack);
		} else {
			var listOfAddresses = [];
			data.Items.forEach(function(element, index, array) {
				deleteItemSubList(element.Address.S, emailAddress, function(err, data) {})
			});
		}
	});

	// removing user
	var params = {
		Key: {
			"UserId": {
				S: userId
			}
		},
		TableName: config.userTableName
	};
	dynamodb.deleteItem(params, function(err, data) {
		if (err)  {
			logger.errorLog.error("[User DB Delete items]: Error removing user for [Email]: " + emailAddress + " [UserId]: " + userId + " [Error Message]:" + err.stack);
			callback(err);
		} else {
			logger.accessLog.info("[User DB Delete items]: Successfully removed user for [Email]: " + emailAddress + " [UserId]: " + userId);
			callback(null, true);
		}
	});
}
module.exports.deleteUser = deleteUser;

// ===== BLACKLIST TABLE ====
function isBlacklistAddress(address, callback) {
    var params = {
        Key: {
            "Address": {
                S: address
            }
        },
        TableName: config.blacklistTablenName
    };
    dynamodb.getItem(params, function(err, data) {
		if (err) {
			logger.errorLog.error("[DB Get blacklist]: Error getting blacklist for [XRP]: " + address + " [Error Message]:" + err.stack);
			callback(err)
		} else {
			if (typeof data.Item === "undefined" || data.Item === null) {
				callback(null, null);
			} else {
				callback(null, data.Item.Note.S);
			}

		}
	});
}
module.exports.isBlacklistAddress = isBlacklistAddress;
