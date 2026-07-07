declare module "cos-nodejs-sdk-v5" {
  import type { Readable } from "node:stream";

  type PutObjectParams = {
    Bucket: string;
    Region: string;
    Key: string;
    Body: Buffer | Readable | string;
    ContentLength?: number;
    ContentType?: string;
  };

  type CosCallback<T = unknown> = (error: Error | null, data: T) => void;

  class COS {
    constructor(options: { SecretId: string; SecretKey: string });
    putObject(params: PutObjectParams, callback: CosCallback): void;
  }

  export = COS;
}
