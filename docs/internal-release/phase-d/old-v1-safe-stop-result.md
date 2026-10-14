# 旧 V1 隔离实例安全停止盘点

最新确认：2026-10-14。未向旧 V1 发送停止信号。

旧实例仍需能访问原始控制台的操作员完成身份核对和原生 graceful stop。具体 Windows 主机账户、进程 PID、可寻址端口、pipe、lock 和服务绑定信息仅记录在受限运维 evidence 中，不公开。没有强杀、删锁或触碰其他服务。

## 最小操作

1. 由原控制台操作员核对旧隔离实例身份。
2. 在原控制台使用该实例支持的 graceful stop。
3. 只读确认 Supervisor、受管子进程、Job Helper、pipe/lock 与监听全部释放。
4. 若控制台不可达，先确认该实例专属的受支持 graceful IPC；不要使用强制进程终止或裸 Job 终止。

D1/D2 新隔离实例均独立 graceful shutdown，不改变旧 V1 状态。
