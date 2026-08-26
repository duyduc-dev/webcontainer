type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export class Logger {
  private readonly threadName: string = "MAIN";

  constructor(threadName = "MAIN") {
    this.threadName = threadName;
  }

  info(...message: any[]) {
    this.log("INFO", message);
  }

  warn(...message: any[]) {
    this.log("WARN", message);
  }

  error(...message: any[]) {
    this.log("ERROR", message);
  }

  debug(...message: any[]) {
    this.log("DEBUG", message);
  }

  private log(level: LogLevel, message: any[]) {
    const now = this.getTimeNow();
    console.log(`[${now}][${this.threadName}][${level}] ~>`, ...message);
  }

  private getTimeNow() {
    const date = new Date();
    return `${date.toLocaleDateString("en-CA")} ${date.toTimeString().split(" ")[0]}`;
  }
}

export const logger = new Logger("MAIN");
