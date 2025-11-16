import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { deepSanitize } from '../utils/sanitize.util';

@Injectable()
export class SanitizeInputPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (!value) return value;
    // Only sanitize body/query/param payloads
    if (['body', 'query', 'param'].includes(metadata.type)) {
      return deepSanitize(value);
    }
    return value;
  }
}
