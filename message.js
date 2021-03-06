#!/usr/bin/env node

"use strict";

let PORT = 80;
let TOKEN = require("fs").readFileSync("TOKEN.txt", "utf8").trim();

let http = require("http");
let qs = require("qs");
let parseString = require("xml2js").parseString;
let request = require('request');

function checkSignature(params, token) {
    let key = [token, params.timestamp, params.nonce].sort().join("");
    let sha1 = require("crypto").createHash("sha1");
    sha1.update(key);
    return sha1.digest("hex") == params.signature;
}

function makeXMLResponse(origMsg, content) {
    console.log("makeXMLResponse | content:", content);
    let toUser = origMsg.FromUserName[0];
    let fromUser = origMsg.ToUserName[0];
    let createTime = Date.now().toString().substring(0, 10);
    return `<xml>
        <ToUserName><![CDATA[${toUser}]]></ToUserName>
        <FromUserName><![CDATA[${fromUser}]]></FromUserName>
        <CreateTime>${createTime}</CreateTime>
        <MsgType><![CDATA[text]]></MsgType>
        <Content><![CDATA[${content}]]></Content>
        </xml>`
}

function callBotAPI(msg) {
    return new Promise(function (resolve, reject) {
        let msgType = msg.MsgType[0];  //收到消息的类型
        switch (msgType) {
            case "text":
                let url = "http://api.qingyunke.com/api.php?key=free&appid=0&msg=" + msg.Content[0];
                request(encodeURI(url), function (error, response, body) {
                    console.log("callBotAPI | url:", url, " body:", body);
                    if (error) {
                        console.log("callBotAPI | error:", error);
                        throw error;  //异常也会被 .catch() 捕获，无需显示调用 reject()
                    } else {
                        let apiResponse = JSON.parse(body);  //可能抛出异常，无需在此处 catch
                        /*
                         注意以下写法不正确：
                         try {
                         ...
                         } catch(error) {
                         reject(error)
                         }
                         调用 reject 后，后续代码仍会执行。
                         */

                        if (apiResponse.result === 0) {
                            resolve(apiResponse.content);
                        } else {
                            throw new Error("Bot API returned wrong data");
                        }
                    }
                });
                break;
            default:
                resolve("Sorry，我只看得懂文字哦");
        }
    });
}

let server = http.createServer(function (request, response) {
    let query = require("url").parse(request.url).query;
    let params = qs.parse(query);

    if (!checkSignature(params, TOKEN)) {
        response.end("signature fail");
        return;
    }

    if (request.method === "GET") {
        response.end(params.echostr);  //接入认证
    } else {
        let postData = "";
        request.addListener("data", function (postChunk) {  //data 事件不会在注册监听器前触发吗？
            postData += postChunk;
        });

        request.addListener("end", function () {
            let msg = null;
            parseString(postData, function (error, result) {
                if (error) {
                    console.log(error);
                    response.end("fail");
                } else {
                    msg = result.xml;
                    callBotAPI(msg)
                        .then(reply => response.end(makeXMLResponse(msg, reply)))
                        .catch(error => response.end(makeXMLResponse(msg, error)))
                }
            });
        });
    }
});

server.listen(PORT);
console.log("Server running at port:", PORT);