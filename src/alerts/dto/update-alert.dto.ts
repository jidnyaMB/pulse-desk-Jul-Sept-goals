import { IsIn } from 'class-validator';

export class UpdateAlertDto {
  @IsIn(['open', 'resolved'])
  status: string;
}
