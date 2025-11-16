import { ArgumentMetadata, PipeTransform } from '@nestjs/common';
export declare class SanitizeInputPipe implements PipeTransform {
    transform(value: any, metadata: ArgumentMetadata): any;
}
