/**
 * Controllable fake for the AWS SDK. `lib/storage/s3.ts` runs for real, only the
 * network edge (S3Client.send / getSignedUrl) is replaced.
 */

export interface FakeObject {
  size: number;
  contentType: string | null;
}

export const s3State = {
  objects: new Map<string, FakeObject>(),
  deletedKeys: [] as string[],
  headCalls: [] as string[],
  presignedCommands: [] as Array<Record<string, unknown>>,
  failDelete: false,
  reset(): void {
    this.objects.clear();
    this.deletedKeys.length = 0;
    this.headCalls.length = 0;
    this.presignedCommands.length = 0;
    this.failDelete = false;
  },
  /** Pretend the client uploaded a file. */
  putObject(key: string, object: Partial<FakeObject> = {}): void {
    this.objects.set(key, { size: 1024, contentType: "image/png", ...object });
  },
};

export class FakeS3Error extends Error {
  readonly $metadata: { httpStatusCode: number };
  constructor(name: string, status: number) {
    super(name);
    this.name = name;
    this.$metadata = { httpStatusCode: status };
  }
}
