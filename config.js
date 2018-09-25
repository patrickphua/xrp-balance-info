var config = {};
// DB operations
config.dynamoDBRegion = "<dbRegion>"
config.tableName = "<tableName>";
config.subRequestTableName = "<subscribeRequestTable>";
config.unsubRequestTableName = "<unsubscribeRequestTable>";
config.userTableName = "<userTable>";
config.blacklistTablenName = "<blacklistTable>";

// Email templates
config.baseURL = "https://xrpbalance.info"
config.adminEmail = "<adminEmail>";

config.rippledServer = "wss://s1.ripple.com";

// capcha and encryption secret
config.encryptSecret = "<secret>";
config.googleCaptchaSecretKey = "<secret>";

module.exports = config;
