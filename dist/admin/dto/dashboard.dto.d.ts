export declare class RangeDto {
    from?: string;
    to?: string;
}
export declare class TimeSeriesDto extends RangeDto {
    granularity?: 'day' | 'week' | 'month';
}
export declare class LimitDto {
    limit?: number;
}
export declare class ThresholdDto {
    threshold?: number;
}
