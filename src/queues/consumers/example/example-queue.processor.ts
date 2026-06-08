import { Processor, OnWorkerEvent, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'

import { EXAMPLE_QUEUE, ExampleJobName } from '../../queues.constant'
import { ExampleJobDtos, ExampleJobDto } from './dto/example-job.dto'

@Processor(EXAMPLE_QUEUE)
export class ExampleQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(ExampleQueueProcessor.name)

  async process(job: Job<ExampleJobDtos, unknown, string>): Promise<void> {
    switch (job.name) {
      case ExampleJobName.PROCESS_EXAMPLE:
        await this.handleProcessExample(job as Job<ExampleJobDto>)
        break
      default:
        throw new Error(`Unknown job name: ${job.name}`)
    }
  }

  private async handleProcessExample(job: Job<ExampleJobDto>): Promise<void> {
    this.logger.log(`Processing example job ${job.id} with payload: ${JSON.stringify(job.data.payload)}`)
    // TODO: implement job logic
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Job ${job.id} completed successfully`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    this.logger.error(`Job ${job.id} failed: ${error.message}`)
  }
}
