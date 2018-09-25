# XRP Balance Info

Get notified whenever transactions occur on XRP addresses.

The script opens a websocket and (subscribes)[https://ripple.com/build/rippled-apis/#subscribe] to accounts on the XRP leger. Whenever transaction occurs on any of the accounts, an email notification will be sent.

The library used is [rippled-ws-client](https://github.com/WietseWind/rippled-ws-client) which is a great complement to (ripple-lib)[https://github.com/ripple/ripple-lib] from Ripple.

This particular implementation utilizes DynamoDB (because free) to store the XRP addresses and their corresponding notification email addresses. The email provider is Amazon Simple Email Service (because free again). Both are rather cumblesome to use, and can be easily replaced with any tool of your choice.

## Getting Started

### Installing

Install dependencies

```
npm install
```

## Configuration

The configuration file (config.js) allows you to set the following

* Database info (name of tables)
* URLs to be inserted in the notification email
* Rippled server
* Google Captcha and encryption secret key


## Running

Run the websocket client
```
node websocket.js
```

Run the web server
```
node index.js
```

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Acknowledgments

* The original [rippled-ws-client](https://github.com/WietseWind/rippled-ws-client) by [@WietseWind](https://twitter.com/WietseWind)
