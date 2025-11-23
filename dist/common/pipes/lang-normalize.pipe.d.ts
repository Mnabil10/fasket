import { PipeTransform } from '@nestjs/common';
import { LangCode } from '../utils/localize.util';
export declare class LangNormalizePipe implements PipeTransform {
    transform(value: unknown): LangCode | undefined;
}
