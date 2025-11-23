import { Injectable, PipeTransform } from '@nestjs/common';
import { LangCode, normalizeLang } from '../utils/localize.util';

@Injectable()
export class LangNormalizePipe implements PipeTransform {
  transform(value: unknown): LangCode | undefined {
    // Support repeated query params (either arrays or comma-delimited strings) and pick the first valid entry
    return normalizeLang(value);
  }
}
