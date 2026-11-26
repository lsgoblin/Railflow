# RailFlow 前端（城市行程历史回放）

原生 HTML、CSS 和 ES Modules，与 Java 后端同源运行。主页使用固定版 GTFS 的全量城市与铁路车站目录。

## 本地运行

先按[后端说明](../backend/README.md)加载开发库环境并离线打包，然后从仓库根目录启动 Web profile。

```powershell
& 'C:\Program Files\Java\jdk-17\bin\java.exe' -jar `
  src/backend/target/railflow-backend.jar `
  --spring.profiles.active=web --server.port=8080
```

浏览器访问 [本地主页](http://127.0.0.1:8080/)。从其他工作目录启动时传入 `--railflow.frontend.dir`，指向 `src/frontend` 的绝对路径。普通 Web 启动使用已导入的开发库。

## 规划与地图

1. 点击高德底图上可匹配的城市或铁路站，即可按顺序加入同一行程。车站对应多个站码时，在列表中选定站码。底图放大后会显示更多可选标注，也可搜索城市、站名和站码。以站码加入会选中相应的到发站，可在节点中分别切回自动选站。
2. 可修改出发日期、参考自然日和最短换乘间隔。两个日期初值都来自数据包的默认参考日。换乘间隔由用户填写。
3. 添加、移除、重排城市或编辑站点、停留天数、日期、换乘间隔会自动请求规划。中间城市默认停留一天。较早请求的规划与几何响应无法覆盖较新行程。
4. 列表按行程顺序显示实际到发站、车次、北京时间、停留和系统换乘。无路线时保留输入及已匹配区间。地图绘制有源几何的乘车区间，轨迹缺失时保留车次和原因。

`/api/replay/cities`、`/api/replay/stations`、`/api/replay/locations` 和 `/api/replay/plans` 提供目录与规划。前端按规划给出的车次、参考服务日、站码与停站序号请求原有 `/api/mvp/trips/{tripId}/geometry`。详情见[城市行程历史回放契约](../../docs/design/city-replay.md)。

输入关键词后可点击「搜索高德地点」查询普通地点。本地城市与铁路站联想独立运行。选择高德地点后可在地图上定位，并在详情里查找、选择和确认要加入行程的本地城市或铁路站。普通地点查询由同源 `/api/places` 提供，凭据配置见[后端运行说明](../backend/README.md#4-运行三个-profile)。

高德底图沿用 `config.example.js` 与受忽略的 `config.local.js`。同源部署将 `apiBase` 留空。高德视图复用底图自带标注，并绘制当前行程的点线。指定 `?map=offline` 可用等距投影和本地目录标记检查 GTFS 几何及地图点选。`?mapfail=1` 可验证底图重试。高德适配器将 WGS84 坐标转换一次，源几何保持 WGS84。
