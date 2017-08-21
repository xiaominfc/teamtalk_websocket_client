# teamtalk_websocket_client
给teamtalk_websocket_server测试用的前端实现代码

弱弱的参考https://github.com/xiaominfc/teamtalk_websocket_server编译出websocket_server并运行

```
修改js/im.js 
var imConnectionUrl = 'ws://192.168.0.114:9090/chat';
改成你配置的websocket_server的ip跟port
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

