import { Injectable } from '@nestjs/common';

@Injectable()
export class ClockService {
  ahora(): Date {
    return new Date();
  }
}
