//
//  ReactNativeBlobUtilProgress.m
//  ReactNativeBlobUtil
//
//  Created by Ben Hsieh on 2016/9/25.
//  Copyright © 2016年 wkh237.github.io. All rights reserved.
//

#import "ReactNativeBlobUtilProgress.h"

@interface ReactNativeBlobUtilProgress ()
{
    float progress;
    int tick;
    double lastTick;
}
@end

@implementation ReactNativeBlobUtilProgress

-(id)initWithType:(ProgressType)type interval:(NSNumber *)interval count:(NSNumber *)count
{
    self = [super init];
    self.count = count;
    self.interval = [NSNumber numberWithFloat:[interval floatValue] /1000];
    self.type = type;
    self.enable = YES;
    lastTick = 0;
    tick = 1;
    return self;
}

-(BOOL)shouldReport:(NSNumber *)nextProgress
{
    BOOL result = YES;
    float countF = [self.count floatValue];
    if(countF > 0 && [nextProgress floatValue] > 0)
    {
        result = (int)(floorf([nextProgress floatValue]*countF)) >= tick;
    }

    NSTimeInterval timeStamp = [[NSDate date] timeIntervalSince1970];
    // NSTimeInterval is defined as double
    NSNumber *timeStampObj = [NSNumber numberWithDouble: timeStamp];
    float delta = [timeStampObj doubleValue] - lastTick;
    BOOL shouldReport = delta > [self.interval doubleValue] && self.enable && result;
    // Always report completion. Otherwise the final event of a transfer is
    // dropped whenever it lands inside the interval window, and a caller
    // watching progress never sees 100%. Measured on Windows: the last upload
    // event (written == total) was thrown away and the only survivor carried
    // zero bytes.
    if(!shouldReport && self.enable && [nextProgress floatValue] >= 1)
    {
        shouldReport = YES;
    }
    if(shouldReport)
    {
        tick++;
        lastTick = [timeStampObj doubleValue];
    }
    return shouldReport;

}


@end
