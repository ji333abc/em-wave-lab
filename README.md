# 场记 · 电磁波实验记录

手机优先的校园无线信号场强实验记录工具，部署于 GitHub Pages。

**网站：https://ji333abc.github.io/em-wave-lab/**

## 使用

1. 填写组名、日期、地点、实际频点和仪器读数单位。
2. 同一地点、状态、频率和单位作为一个测量组；更换条件时新建组。
3. 输入电平后点击保存，可连续录入。批量录入支持空格、换行、中文或英文逗号、分号。
4. 每组显示 51 点进度、对数电平均值和样本标准差。单个读数可在表格或最近记录中修改、删除。
5. 在「导出与备份」下载原始 CSV、分组统计 CSV、JSON 备份或 MATLAB 脚本。

依据用户提供讲义中「校园内无线信号场强特性的研究」的采集需求设计。未上传讲义原文件。讲义要求每个地点数据超过 50 个，因此进度目标为 51。半波长间距按 λ/2 = 299.792458 / (2 f_MHz) 米计算。

默认单位为 dBμV，可选 dBm、dBμV/m。按仪器原始显示记录，无隐式单位转换。手机不自动测量电磁场。

## 手机与数据保存

- 响应式单列录入、底部导航、数字输入提示、手机卡片数据视图。
- 每次有效条件修改和读数保存均写入 localStorage。存储失败会明确报错，未提交更改不会伪装成保存成功。
- 数据仅在当前浏览器、当前设备；无账号、无后台、无遥测，不向 GitHub 上传实验数据。
- 不同设备不会自动同步。通过 JSON 备份导入合并；编号冲突保留副本。清理浏览器、无痕窗口关闭可能丢失本地数据，请及时备份。
- 多标签页冲突时阻止覆盖，先导出各页备份、刷新后合并。
- Service Worker 缓存应用资源，首次完整联网打开后可离线使用。更新在线优先，缓存范围仅为本应用。
- 单组最多 50000 条，批次最多 5000 条，备份导入最多 30 MB / 200000 条。实际可用存储取决于浏览器。

## CSV 数据格式

UTF-8 BOM、逗号分隔、CRLF，英文列名。每行一个样本，附完整分组条件。空白可选数值导出为空；电平不四舍五入导出，显示保留 2 位不影响原始值。

| 列 | 含义 / 单位 |
| --- | --- |
| measurement_date | 测量日期 YYYY-MM-DD，以组内手动日期为准 |
| location | 地点、楼号、道路 |
| position | 靠窗、走廊、中央等状态 |
| level | 仪器原始对数读数，数值 |
| unit | dBuV / dBm / dBuV/m |
| group_id, group_name | 测量组唯一编号、名称 |
| environment | indoor / outdoor |
| frequency_mhz | 测量频率，MHz |
| material | masonry / reinforced_concrete / other / unspecified |
| floor | 楼层整数，地下层可用负数 |
| pair_id | 室内外穿透损耗配对编号 |
| distance_m, height_m | 收发距离、接收天线高度，m，可空 |
| instrument | 仪器名称 |
| group_notes, sample_note | 组条件备注、单条备注 |
| sample_id, sample_index | 样本唯一编号、组内当前次序 |
| recorded_at_utc | 实际录入时间 UTC ISO 8601；与测量日期分开 |

为避免表格软件执行公式，以 =、+、-、@ 等开头的文本会加前置单引号，原始内容在 JSON 中保留。负数电平等数值列保持数值类型，不添加单引号。Excel 可直接打开 CSV；CSV 不支持多个工作表。

统计导出 group_summary.csv 包含每组 count、mean_level、std_level、min_level、max_level、median_level 和 sampling_complete。标准差按 n−1；n < 2 时为空。

## MATLAB

MATLAB R2020b 或更新版本，无需 Statistics and Machine Learning Toolbox：

```matlab
T = readtable('measurements.csv', 'Encoding','UTF-8','TextType','string');
```

运行 [matlab/analyze_em_wave.m](matlab/analyze_em_wave.m)，选择原始 CSV。脚本按 group_id 分组，绘制直方图和拟合正态 PDF、标准化经验 CDF 与标准正态 CDF；输出 matlab_summary.csv、matlab_penetration.csv。单样本或标准差为零时不做标准化。

穿透损耗 = 室外读数的算术均值 − 室内读数的算术均值，单位 dB。仅匹配相同配对编号、测量日期、频率、单位和仪器。多个匹配室外组按全部样本合并计算，每个室内组单独比较。材料、楼层保留为分析条件，不自动证明条件可比；操作者需要确保选定的室外参考有效。小于 51 点的结果为预览，负损耗保留核查。采用对数电平算术平均，不做线性功率平均，不计算天线因子或绝对路径损耗。

## 开发与发布

纯静态 HTML / CSS / JavaScript，无框架构建、无第三方运行依赖。资源均采用相对路径，适用于 GitHub Pages 项目子路径。

```sh
npm test
python -m http.server 4173 --bind 127.0.0.1
```

GitHub Pages 使用 main 分支根目录，.nojekyll 跳过 Jekyll。以后推送到 main 自动更新。配置方式见 [GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

核心测试覆盖数值解析、n−1 标准差、CSV 引号与公式转义、穿透损耗条件隔离、备份校验和合并冲突。浏览器验收记录见 VALIDATION.md。
