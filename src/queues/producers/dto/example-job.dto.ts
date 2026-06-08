export type QueueJobDto = ExampleJobDto

export interface ExampleJobDto {
  id: string
  payload: Record<string, any>
}
