import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { JobsOptions, Queue } from 'bullmq'

import { EXAMPLE_QUEUE, ExampleJobName } from '../queues.constant'
import { ExampleJobDto, QueueJobDto } from './dto/example-job.dto'

@Injectable()
export class QueueProducer {
  private readonly preConfig: JobsOptions

  constructor(
    @InjectQueue(EXAMPLE_QUEUE)
    private readonly exampleQueue: Queue<QueueJobDto>,
  ) {
    this.preConfig = {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: { count: 50 },
    }
  }

  async processExampleJob(data: ExampleJobDto): Promise<void> {
    await this.exampleQueue.add(ExampleJobName.PROCESS_EXAMPLE, data, this.preConfig)
  }
}
