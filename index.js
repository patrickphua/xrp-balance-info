var config = require('./config');
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const db = require('./dbOperations');
const util = require('./util');
var logger = require('./logger');
var jwt = require('jsonwebtoken');
var shortid = require('shortid');

var app = express();

// render initial page
app.use(express.static('public'));
app.use(bodyParser.urlencoded({
	extended: true
}));
app.set('view engine', 'ejs');

app.get('/', function(req, res) {
	res.render('index', {
	});
})

app.get('/tnc', function(req, res) {
	res.render('tnc', {
	});
})

app.post('/', function(req, res) {
	// validation
	var xrpAddress = req.body.address;
	var emailAddress = req.body.email;
	var captchaError = "";
	// captcha
	if (req.body['g-recaptcha-response'] === undefined || req.body['g-recaptcha-response'] === '' || req.body['g-recaptcha-response'] === null) {
		captchaError = "Enter captcha";
		res.render('index', {
			email: emailAddress,
			address: xrpAddress,
			captchaError: captchaError
		});
	} else {
		const verificationURL = "https://www.google.com/recaptcha/api/siteverify?secret=" + config.googleCaptchaSecretKey + "&response=" + req.body['g-recaptcha-response'] + "&remoteip=" + req.connection.remoteAddress;
		// captcha verification
		request(verificationURL, function(error, response, body) {
			body = JSON.parse(body);

			if (body.success !== undefined && !body.success) {
				captchaError = "Failed captcha verification";
				logger.errorLog.error("Failed captcha verification");
				res.render('index', {
					email: emailAddress,
					address: xrpAddress,
					captchaError: captchaError
				});
			} else {
				// check if it's blacklist
				db.isBlacklistAddress(xrpAddress, function(err, blacklist) {
					if (blacklist) {
						logger.accessLog.info("[Blacklist] This is a blacklisted address: " + xrpAddress);
						var blacklistAddress = "This is a known " + blacklist + " exchange address. We do not track exchanges' accounts.";
						res.render('index', {
							email: emailAddress,
							address: xrpAddress,
							blacklistAddress: blacklistAddress
						});
					} else {
						// check if user exists
						db.isUserExists(emailAddress, function(err, userId) {
							if (userId) {	// if user, add email and xrp address to subscription request processing
								db.addItemSubRequest(xrpAddress, emailAddress);
								logger.accessLog.info("[Subscribe] Added XRP to sub list as user already exists for [Email]: " + emailAddress);
								// render dashboard
								res.render('verify', {
									successMessage: "<p>Successfully queued XRP address [" + xrpAddress + "]. for subscription.</p><p>For more information, please visit your personalized dashboard.</p>."
								});
							} else {	// generate email token and send
								var data = {};
								data.emailAddress = emailAddress;
								data.xrpAddress = xrpAddress;
								data.expiry = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);	// 1 day
								logger.accessLog.info("[Token generation] Generate token for [Email]: " + emailAddress + " [XRP]: " + xrpAddress + " [Token Expiry]: " + data.expiry);
								generateToken(data, function(token) {
									util.sendTemplateEmail(emailAddress, null, token, null, null, "verification", function(err, data) {
										if (err) {
											// error email, try again
											res.render('verify', {
												errorMessage: "Error sending verification email. Please try again."
											})
										} else {
											// check your email
											res.render('verify', {
												successMessage: "Please check your inbox for a verification email."
											});
										}
									});
								})
							}
						});
					}
				});
			}
		});
	}
});

app.get('/verify/:token', function(req, res) {
	var token = req.params.token;
	tokenDecrypt(token, function(data) {
		if (typeof data !== 'undefined' && data !== null) {	// check if successful decrypt
			var emailAddress = data.emailAddress;
			var xrpAddress = data.xrpAddress;
			var expiry = data.expiry;
			var dateNow = new Date(new Date().getTime());

			logger.accessLog.info("[Email verification] Start processing email verification for [Email]: " + emailAddress + " [XRP]: " + xrpAddress + " [Token Expiry]: " + expiry);

			// check expiry
			if ((Date.parse(expiry) - dateNow) < 0) {	// expired
				// render dashboard
				res.render('dashboard', {
					error: "Your verification email has expired. Please return to the main page to begin the process again."
				});
			} else {
				// if user already exists, directly show dashboard
				db.isUserExists(emailAddress, function(err, userId) {
					// add email and xrp address to subscription request processing
					db.addItemSubRequest(xrpAddress, emailAddress);
					if (userId) {	// already exists
						logger.accessLog.info("[Email verification] User already exists for [Email]: " + emailAddress);
						// render dashboard
						res.redirect('../dashboard/'+userId);
					} else {	// create new user
						logger.accessLog.info("[Email verification] Successful email verification for [Email]: " + emailAddress);
						var userId = shortid.generate();
						db.addUser(userId, emailAddress, function(err, userId) {
							if (err) {
								// render dashboard
								res.render('dashboard', {
									error: "Something went wrong. Please try again."
								});
							} else {
								// send welcome email
								sendWelcomeEmail(userId, emailAddress, function(err, data) {
									if (err) {
										// error sending email, try again
										res.render('dashboard', {
											error: "Something went wrong. Please try again."
										});
									} else {
										// render dashboard
										res.redirect('../dashboard/'+userId);
									}
								});
							}
						});
					}
				});
			}
		} else {	// invalid token
			// render dashboard
			res.render('dashboard', {
				error: "Unable to verify email address. Please ensure you have the correct URL as provided in the welcome email."
			});
		}
	});
});

app.get('/updateEmail/:token', function(req, rest) {
	var token = req.params.token;
	tokenDecrypt(token, function(data) {
		if (typeof data !== 'undefined' && data !== null) {	// check if successful decrypt
			var emailAddress = data.emailAddress;
			var userId = data.userId;
			var expiry = data.expiry;
			var dateNow = new Date(new Date().getTime());

			logger.accessLog.info("[Update Email verification] Start processing email verification for [Email]: " + emailAddress + " [Token Expiry]: " + expiry);

			// check expiry
			if ((Date.parse(expiry) - dateNow) < 0) {	// expired
				// render dashboard
				res.render('dashboard', {
					error: "Your verification email has expired. Please return to the dashboard to begin the process again."
				});
			} else {
				// update email in sublist

				// update email in user table

				// render dashboard
				res.redirect('../dashboard/'+userId);
			}
		} else {	// invalid token
			// render dashboard
			res.render('dashboard', {
				error: "Unable to verify email address. Please ensure you have the correct URL as provided in the email."
			});
		}
	});
});

// user dashboard
app.get('/dashboard/:userId', function(req, res) {
	var userId = req.params.userId;
	if (typeof userId === "undefined" || userId === "login") {
		res.render('dashboard', {
			login: true
		});
	} else {
		db.getUser(userId, function(err, userInfo) {
			if (typeof userInfo.Item === "undefined" || userInfo === null) {
				res.render('dashboard', {
					error: "Invalid URL. Please ensure you got the correct URL."
				});
			} else {
				displayUserDashboard(userId, userInfo.Item.Email.S, res);
			}
		})
	}
});

// post from dashboard (unsub address)
app.post('/unsub', function(req, res) {
	var emailAddress = req.body.email;
	var xrpAddress = req.body.add;
	logger.accessLog.info("[Dashboard] Received unsubscribe request for [Email]: " + emailAddress + " [XRP]: " + xrpAddress);
	db.addItemUnsubRequest(xrpAddress, emailAddress);
	res.send(xrpAddress);
 });

// post from dashboard (sub address)
app.post('/sub', function(req, res) {
	var emailAddress = req.body.email;
	var xrpAddress = req.body.add;
	logger.accessLog.info("[Dashboard] Received subscribe request for [Email]: " + emailAddress + " [XRP]: " + xrpAddress);
	db.isBlacklistAddress(xrpAddress, function(err, blacklist) {
		if (blacklist) {
			logger.accessLog.info("[Blacklist] This is a blacklisted address: " + xrpAddress);
			var blacklistAddress = "This is a known " + blacklist + " exchange address. We do not track exchanges' accounts.";
			res.send(blacklistAddress);
		} else {
			db.addItemSubRequest(xrpAddress, emailAddress);
			res.send(false);
		}
	});
 });

app.post('/updateEmail', function(req, res) {
	var emailAddress = req.body.email;
	var userId = req.body.userId;
	logger.accessLog.info("[Dashboard] Received update email for [Email]: " + emailAddress + " [UserId]: " + userId);

	// generate token
	var data = {};
	data.emailAddress = emailAddress;
	data.userId = userId;
	data.expiry = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);	// 1 day
	logger.accessLog.info("[Token generation] Generate token for [Email]: " + emailAddress + " [Token Expiry]: " + data.expiry);
	generateToken(data, function(token) {
		util.sendTemplateEmail(emailAddress, null, token, null, null, "updateEmail", function(err, data) {
			if (err) {
				logger.errorLog.error("[Update Email] Error sending verification email [Email]: " + emailAddress + " [UserId]: " + userId);
				res.send(false);
			} else {
				logger.accessLog.info("[Update Email] Success verification email for [Email]: " + emailAddress + " [UserId]: " + userId);
				res.send(true);
			}
		});
	})
});

// post from dashboard (delete account)
app.post('/delete', function(req, res) {
	var emailAddress = req.body.email;
	var userId = req.body.userId;
	logger.accessLog.info("[Dashboard] Received delete account for [Email]: " + emailAddress + " [UserId]: " + userId);

	db.deleteUser(userId, emailAddress, function(err, result) {
		if (result) {
			logger.accessLog.info("[Delete User] Successful deletion for [Email]: " + emailAddress + " [UserId]: " + userId);
		} else {
			logger.errorLog.error("[Delete User] Error deleting [Email]: " + emailAddress + " [UserId]: " + userId);
		}
		res.render('index', {
		});
	})
 });

// post from login
app.post('/resendVerification', function(req, res) {
	var emailAddress = req.body.email;
	const verificationURL = "https://www.google.com/recaptcha/api/siteverify?secret=" + config.googleCaptchaSecretKey + "&response=" + req.body['g-recaptcha-response'] + "&remoteip=" + req.connection.remoteAddress;
	// captcha verification
	request(verificationURL, function(error, response, body) {	// captcha failed
		body = JSON.parse(body);
		if (body.success !== undefined && !body.success) {
			logger.errorLog.error("[Resend Welcome Email] Failed captcha verification");
			res.render('dashboard', {
				login: true,
				email: emailAddress,
				captchaError: "Failed captcha verification"
			});
		} else {	// get userid and send out email
			db.getUserId(emailAddress, function(err, userId) {
				if (err) {
				} else {
					if (userId === null) {
						res.render('dashboard', {
							error: "We cannot find an user with the email address [ " + emailAddress + " ].<br />Please ensure you have entered the correct email address."
						});
					} else {
						// send welcome email
						sendWelcomeEmail(userId, emailAddress, function(err, data) {
							if (err) {
								// error email, try again
								res.render('verify', {
									errorMessage: "Error sending welcome email. Please try again."
								})
							} else {
								// check your email
								res.render('verify', {
									successMessage: "Check your email for the unique URL in the welcome email."
								});
							}
						});
					}
				}
			});
		}
	});
});

app.use(function (req, res, next) {
	res.status(404);
	res.render('404', {
		url: req.url
	});
});

// port setup
app.listen(3000, function() {
	logger.accessLog.info("[App] App is listening on port 3000...");
});

function generateToken(data, callback) {
	var token = jwt.sign(data, config.encryptSecret);
	callback(token);
}

function tokenDecrypt(token, callback) {
	var data = jwt.decode(token, config.encryptSecret);
	callback(data);
}

function sendWelcomeEmail(userId, emailAddress, callback) {
	util.sendTemplateEmail(emailAddress, userId, null, null, null, "welcome", function(err, data) {
		callback(err, data);
	});
}

function displayUserDashboard(userId, emailAddress, res) {
	db.getXRPAddressesFromEmail(emailAddress, function(listOfAddresses) {
		db.getItemsSubRequestByEmail(emailAddress, function(listOfAddressesSubRequest) {
			res.render('dashboard', {
				userId: userId,
				emailAddress: emailAddress,
				listOfAddresses: listOfAddresses,
				listOfAddressesSubRequest: listOfAddressesSubRequest
			});
		});
	});
}
