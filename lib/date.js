'use strict';

import moment from 'moment/moment';
import 'moment-timezone/moment-timezone';

export default class CronDate
{
    constructor(timestamp, tz)
    {
        if (timestamp instanceof CronDate)
        {
            timestamp = timestamp._date;
        }

        if (!tz)
        {
            this._date = moment(timestamp);
        } else
        {
            this._date = moment.tz(timestamp, tz);
        }
    }

    addYear()
    {
        this._date.add(1, 'year');
    }

    addMonth ()
    {
        this._date.add(1, 'month').startOf('month');
    }

    addDay ()
    {
        this._date.add(1, 'day').startOf('day');
    }

    addHour ()
    {
        var prev = this.getTime();
        this._date.add(1, 'hour').startOf('hour');
        if (this.getTime() <= prev)
        {
            this._date.add(1, 'hour');
        }
    }

    addMinute ()
    {
        var prev = this.getTime();
        this._date.add(1, 'minute').startOf('minute');
        if (this.getTime() < prev)
        {
            this._date.add(1, 'hour');
        }
    }

    addSecond ()
    {
        var prev = this.getTime();
        this._date.add(1, 'second').startOf('second');
        if (this.getTime() < prev)
        {
            this._date.add(1, 'hour');
        }
    }

    subtractYear ()
    {
        this._date.subtract(1, 'year');
    }

    subtractMonth ()
    {
        this._date.subtract(1, 'month').endOf('month');
    }

    subtractDay ()
    {
        this._date.subtract(1, 'day').endOf('day');
    }

    subtractHour ()
    {
        var prev = this.getTime();
        this._date.subtract(1, 'hour').endOf('hour');
        if (this.getTime() >= prev)
        {
            this._date.subtract(1, 'hour');
        }
    }

    subtractMinute ()
    {
        var prev = this.getTime();
        this._date.subtract(1, 'minute').endOf('minute');
        if (this.getTime() > prev)
        {
            this._date.subtract(1, 'hour');
        }
    }

    subtractSecond ()
    {
        var prev = this.getTime();
        this._date.subtract(1, 'second').startOf('second');
        if (this.getTime() > prev)
        {
            this._date.subtract(1, 'hour');
        }
    }

    getDate ()
    {
        return this._date.date();
    }

    getFullYear ()
    {
        return this._date.year();
    }

    getDay ()
    {
        return this._date.day();
    }

    getMonth ()
    {
        return this._date.month();
    }

    getHours ()
    {
        return this._date.hours();
    }


    getMinutes ()
    {
        return this._date.minute();
    }


    getSeconds ()
    {
        return this._date.second();
    }


    getMilliseconds ()
    {
        return this._date.millisecond();
    }

    getTime ()
    {
        return this._date.valueOf();
    }

    getUTCDate ()
    {
        return this._getUTC().date();
    }

    getUTCFullYear ()
    {
        return this._getUTC().year();
    }

    getUTCDay ()
    {
        return this._getUTC().day();
    }

    getUTCMonth ()
    {
        return this._getUTC().month();
    }

    getUTCHours ()
    {
        return this._getUTC().hours();
    }

    getUTCMinutes ()
    {
        return this._getUTC().minute();
    }

    getUTCSeconds ()
    {
        return this._getUTC().second();
    }

    toISOString ()
    {
        return this._date.toISOString();
    }

    toJSON ()
    {
        return this._date.toJSON();
    }

    setDate (d)
    {
        return this._date.date(d);
    }

    setFullYear (y)
    {
        return this._date.year(y);
    }

    setDay (d)
    {
        return this._date.day(d);
    }

    setMonth (m)
    {
        return this._date.month(m);
    }


    setHours (h)
    {
        return this._date.hour(h);
    }


    setMinutes (m)
    {
        return this._date.minute(m);
    }


    setSeconds (s)
    {
        return this._date.second(s);
    }


    setMilliseconds (s)
    {
        return this._date.millisecond(s);
    }


    getTime ()
    {
        return this._date.valueOf();
    }


    _getUTC ()
    {
        return moment.utc(this._date);
    }


    toString ()
    {
        return this._date.toString();
    }


    toDate ()
    {
        return this._date.toDate();
    }
}
