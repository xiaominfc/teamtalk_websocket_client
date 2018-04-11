# teamtalk_websocket_client

[在线demo](http://chat.xiaominfc.com/im)



给teamtalk_websocket_server测试用的前端实现代码

[弱弱的参考https://github.com/xiaominfc/teamtalk_websocket_server编译出websocket_server并运行](https://github.com/xiaominfc/teamtalk_websocket_server)


```
修改js/my-app.js  15行
var client = new TeamTalkWebClient({wsurl:'ws://im.xiaominfc.com:9090'});
改成你配置的websocket_server的 ip/域名 跟port
放到webserver(apache nginx)的工作目录下
然后访问 index.html 就可以测试了
```

nginx下会出现跳转异常 主要是url少了后缀 可以加个重写的规则
```
location / {
    if (!-e $request_filename){
        rewrite ^(.*)$ /$1.html last;
        break;
    }
}


```

```
2017-08-22
重构了代码，使用6.8.0版的protobuf.js(https://github.com/dcodeIO/protobuf.js)
```


```
2017-08-25
支持语音的解析以及播放(chrome firefox android等)，但是客户端语音的编码格式需要换成Opus，
原来的是speex。speex自己的官网上也说用Opus来替代speex，Opus比speex更好。
客户端的具体替换可以查看我维护的TeamTalk的工程(https://github.com/xiaominfc/TeamTalk)
```

```
2018-04-10
添加心跳包的发送 保活时间更长

```
