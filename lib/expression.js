'use strict';

// Load Date class extensions
import CronDate from './date';
import moment from 'moment';

/**
 * Cron iteration loop safety limit
 */
var LOOP_LIMIT = 10000;

/**
 * Field mappings
 * @type {Array}
 */

const cronMap = ['second', 'minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'];

/**
 * Prefined intervals
 * @type {Object}
 */

const cronPredefined = {
    '@yearly': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@hourly': '0 * * * *'
};

/**
 * Fields constraints
 * @type {Array}
 */

const cronConstraints = [
    [0, 59], // Second
    [0, 59], // Minute
    [0, 23], // Hour
    [1, 31], // Day of month
    [1, 12], // Month
    [0, 7] // Day of week
];

/**
 * Days in month
 * @type {number[]}
 */

const cronDaysInMonth = [
    31,
    29,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
];

/**
 * Field aliases
 * @type {Object}
 */

const cronAliases = {
    month: {
        jan: 1,
        feb: 2,
        mar: 3,
        apr: 4,
        may: 5,
        jun: 6,
        jul: 7,
        aug: 8,
        sep: 9,
        oct: 10,
        nov: 11,
        dec: 12
    },

    dayOfWeek: {
        sun: 0,
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6
    }
};

/**
 * Field defaults
 * @type {Array}
 */

const cronParseDefaults = ['0', '*', '*', '*', '*', '*'];


const standardValidCharacters = /^[\d|/|*|\-|,]+$/;

const dayValidCharacters = /^[\d|/|*|\-|,|\?|L?|W?]+$/;

const dayOfMonthValidCharacters = /^[\d|/|*|\-|,|\L|\?]+$/;

const validCharacters = {
    second: standardValidCharacters,
    minute: standardValidCharacters,
    hour: standardValidCharacters,
    dayOfMonth: dayOfMonthValidCharacters,
    month: standardValidCharacters,
    dayOfWeek: dayValidCharacters
};

export default class CronExpression
{
    /**
     * Construct a new expression parser
     *
     * Options:
     *   currentDate: iterator start date
     *   endDate: iterator end date
     *
     * @constructor
     * @private
     * @param {Object} fields  Expression fields parsed values
     * @param {Object} options Parser options
     */

    constructor(fields, options)
    {
        this._options = options;
        this._utc = options.utc || false;
        this._tz = this._utc ? 'UTC' : options.tz;
        this._currentDate = new CronDate(options.currentDate, this._tz);
        this._startDate = options.startDate ? new CronDate(options.startDate, this._tz) : null;
        this._endDate = options.endDate ? new CronDate(options.endDate, this._tz) : null;
        this._fields = fields;
        this._isIterator = options.iterator || false;
        this._hasIterated = false;
        this._nthDayOfWeek = options.nthDayOfWeek || 0;
        this._isLastDayOfMonth = options._isLastDayOfMonth || false;
    }

    /**
     * Detect if input range fully matches constraint bounds
     * @param {Array} range Input range
     * @param {Array} constraints Input constraints
     * @returns {Boolean}
     * @private
     */
    isWildcardRange(range, constraints)
    {
        if (range instanceof Array && !range.length)
        {
            return false;
        }

        if (constraints.length !== 2)
        {
            return false;
        }

        return range.length === (constraints[1] - (constraints[0] < 1 ? -1 : 0));
    }


    /**
     * Parse input interval
     *
     * @param {String} field Field symbolic name
     * @param {String} value Field value
     * @param {Array} constraints Range upper and lower constraints
     * @return {Array} Sequence of sorted values
     * @private
     */
    static _parseField(field, value, constraints, ctx)
    {
        // Replace aliases
        switch (field)
        {
            case 'month':
            case 'dayOfWeek':
                var aliases = cronAliases[field];

                value = value.replace(/[a-z]{1,3}/gi, function (match)
                {
                    match = match.toLowerCase();

                    if (typeof aliases[match] !== "undefined" && typeof aliases[match] !== undefined)
                    {
                        return aliases[match];
                    } else if (match === "l")
                    {
                        ctx._isLastDayOfMonth = true;
                        return "";
                    } else
                    {
                        throw new Error('Cannot resolve alias "' + match + '"');
                    }
                });

                break;
            case 'dayOfMonth':
                if (value === "L")
                {
                    return 'L';
                }
                break;
        }

        // Check for valid characters.
        if (!(validCharacters[field].test(value)))
        {
            throw new Error('Invalid characters, got value: ' + value);
        }

        // Replace '*' and '?'
        if (value.indexOf('*') !== -1)
        {
            value = value.replace(/\*/g, constraints.join('-'));
        } else if (value.indexOf('?') !== -1)
        {
            value = value.replace(/\?/g, constraints.join('-'));
        }

        //
        // Inline parsing functions
        //
        // Parser path:
        //  - parseSequence
        //    - parseRepeat
        //      - parseRange

        /**
         * Parse sequence
         *
         * @param {String} val
         * @return {Array}
         * @private
         */
        function parseSequence(val)
        {
            var stack = [];

            function handleResult(result)
            {
                var max = stack.length > 0 ? Math.max.apply(Math, stack) : -1;

                if (result instanceof Array)
                { // Make sequence linear
                    for (var i = 0, c = result.length; i < c; i++)
                    {
                        var value = result[i];

                        // Check constraints
                        if (value < constraints[0] || value > constraints[1])
                        {
                            throw new Error(
                                'Constraint error, got value ' + value + ' expected range ' +
                                constraints[0] + '-' + constraints[1]
                            );
                        }

                        if (value > max)
                        {
                            stack.push(value);
                        }

                        max = Math.max.apply(Math, stack);
                    }
                } else
                { // Scalar value
                    result = +result;

                    // Check constraints
                    if (result < constraints[0] || result > constraints[1])
                    {
                        throw new Error(
                            'Constraint error, got value ' + result + ' expected range ' +
                            constraints[0] + '-' + constraints[1]
                        );
                    }

                    if (field == 'dayOfWeek')
                    {
                        result = result % 7;
                    }

                    stack.push(result);
                }
            }

            var atoms = val.split(',');
            if (atoms.length > 1)
            {
                for (var i = 0, c = atoms.length; i < c; i++)
                {
                    handleResult(parseRepeat(atoms[i]));
                }
            } else
            {
                handleResult(parseRepeat(val));
            }

            stack.sort(function (a, b)
            {
                return a - b;
            });

            return stack;
        }

        /**
         * Parse repetition interval
         *
         * @param {String} val
         * @return {Array}
         */
        function parseRepeat(val)
        {
            var repeatInterval = 1;
            var atoms = val.split('/');

            if (atoms.length > 1)
            {
                return parseRange(atoms[0], atoms[atoms.length - 1], true);
            }

            return parseRange(val, repeatInterval);
        }

        /**
         * Parse range
         *
         * @param {String} val
         * @param {Number} repeatInterval Repetition interval
         * @return {Array}
         * @private
         */
        function parseRange(val, repeatInterval, isDivided)
        {
            var stack = [];
            var atoms = val.split('-');

            if (atoms.length > 1)
            {
                // Invalid range, return value
                if (atoms.length < 2)
                {
                    return +val;
                }

                if (!atoms[0].length)
                {
                    if (!atoms[1].length)
                    {
                        throw new Error('Invalid range: ' + val);
                    }

                    return +val;
                }

                // Validate range
                var min = +atoms[0];
                var max = +atoms[1];

                // Create range
                let repeatIndex = +repeatInterval;

                if (isNaN(repeatIndex) || repeatIndex <= 0)
                {
                    throw new Error('Constraint error, cannot repeat at every ' + repeatIndex + ' time.');
                }

                if (isNaN(min) || isNaN(max) ||
                    min < constraints[0] || max > constraints[1])
                {
                    throw new Error(
                        'Constraint error, got range ' +
                        min + '-' + max +
                        ' expected range ' +
                        constraints[0] + '-' + constraints[1]
                    );
                } else if (min >= max)
                {
                    // throw new Error('Invalid range: ' + val);
                    // manage reverse range (ie. DEC-JAN, 10-8, etc...)
                    for(let index = constraints[0]; index <= constraints[1]; index++)
                    {
                        if(index > max && index < min)
                        {
                            repeatIndex++;
                        }
                        else if ( repeatIndex > 0 && (repeatIndex % repeatInterval) === 0)
                        {
                            repeatIndex = 1;
                            stack.push(index);
                        } else
                        {
                            repeatIndex++;
                        }
                    }
                    return stack;
                }


                for (let index = min, count = max; index <= count; index++)
                {
                    if (repeatIndex > 0 && (repeatIndex % repeatInterval) === 0)
                    {
                        repeatIndex = 1;
                        stack.push(index);
                    } else
                    {
                        repeatIndex++;
                    }
                }

                return stack;
            } else if (atoms.length == 1 && repeatInterval != 0 && isDivided)
            {
                // manage recurrence with '/' like 1/4 for every 4 months
                let repeatIndex = +repeatInterval;
                for (let index = parseInt(val); index <= constraints[1]; index += repeatIndex)
                {
                    stack.push(index);
                }
                return stack;
            }

            return +val;
        }

        return parseSequence(value);
    }


    _applyTimezoneShift (currentDate, dateMathVerb, method)
    {
        if ((method === 'Month') || (method === 'Day'))
        {
            var prevTime = currentDate.getTime();
            currentDate[dateMathVerb + method]();
            var currTime = currentDate.getTime();
            if (prevTime === currTime)
            {
                // Jumped into a not existent date due to a DST transition
                if ((currentDate.getMinutes() === 0) &&
                    (currentDate.getSeconds() === 0))
                {
                    currentDate.addHour();
                } else if ((currentDate.getMinutes() === 59) &&
                    (currentDate.getSeconds() === 59))
                {
                    currentDate.subtractHour();
                }
            }
        } else
        {
            var previousHour = currentDate.getHours();
            currentDate[dateMathVerb + method]();
            var currentHour = currentDate.getHours();
            var diff = currentHour - previousHour;
            if (diff === 2)
            {
                // Starting DST
                if (this._fields.hour.length !== 24)
                {
                    // Hour is specified
                    this._dstStart = currentHour;
                }
            } else if ((diff === 0) &&
                (currentDate.getMinutes() === 0) &&
                (currentDate.getSeconds() === 0))
            {
                // Ending DST
                if (this._fields.hour.length !== 24)
                {
                    // Hour is specified
                    this._dstEnd = currentHour;
                }
            }
        }
    }


    /**
     * Find next or previous matching schedule date
     *
     * @return {CronDate}
     * @private
     */
    _findSchedule(reverse)
    {

        /**
         * Match field value
         *
         * @param {String} value
         * @param {Array} sequence
         * @return {Boolean}
         * @private
         */
        function matchSchedule(value, sequence, isLast)
        {
            if (sequence === "L")
            {
                return value.getDate() === value._date.daysInMonth();
            } else if (isLast)
            {
                let lastDay = moment(value._date).endOf('month').endOf('day');

                // manage sequences for Last day in month
                if (Array.isArray(sequence))
                {
                    for (let i = 0; i < sequence.length; i++)
                    {
                        if (matchSchedule(value, sequence[i], isLast))
                        {
                            return true;
                        }
                    }
                    return false;
                }

                switch (sequence)
                {
                    case 1:
                        return value.getDate() === moment(value._date).endOf('month').startOf('isoweek').date();
                    default:
                        return value.getDate() === lastDay.subtract((lastDay.day() + (7 - sequence)) % 7, 'days').date();
                }
            }


            for (let i = 0, c = sequence.length; i < c; i++)
            {
                if (sequence[i] >= value)
                {
                    return sequence[i] === value;
                }
            }

            return sequence[0] === value;
        }

        /**
         * Helps determine if the provided date is the correct nth occurence of the
         * desired day of week.
         *
         * @param {CronDate} date
         * @param {Number} nthDayOfWeek
         * @return {Boolean}
         * @private
         */
        function isNthDayMatch(date, nthDayOfWeek)
        {
            if (nthDayOfWeek < 6)
            {
                if (
                    date.getDate() < 8 &&
                    nthDayOfWeek === 1 // First occurence has to happen in first 7 days of the month
                )
                {
                    return true;
                }

                var offset = date.getDate() % 7 ? 1 : 0; // Math is off by 1 when dayOfWeek isn't divisible by 7
                var adjustedDate = date.getDate() - (date.getDate() % 7); // find the first occurrence
                var occurrence = Math.floor(adjustedDate / 7) + offset;

                return occurrence === nthDayOfWeek;
            }

            return false;
        }

        // Whether to use backwards directionality when searching
        reverse = reverse || false;
        var dateMathVerb = reverse ? 'subtract' : 'add';

        var currentDate = new CronDate(this._currentDate, this._tz);
        var startDate = this._startDate;
        var endDate = this._endDate;

        // Find matching schedule
        var startTimestamp = currentDate.getTime();
        var stepCount = 0;

        while (stepCount < LOOP_LIMIT)
        {
            stepCount++;

            // Validate timespan
            if (reverse)
            {
                if (startDate && (currentDate.getTime() - startDate.getTime() < 0))
                {
                    throw new Error('Out of the timespan range');
                }
            } else
            {
                if (endDate && (endDate.getTime() - currentDate.getTime()) < 0)
                {
                    throw new Error('Out of the timespan range');
                }
            }

            // Day of month and week matching:
            //
            // "The day of a command's execution can be specified by two fields --
            // day of month, and day of week.  If  both	 fields	 are  restricted  (ie,
            // aren't  *),  the command will be run when either field matches the cur-
            // rent time.  For example, "30 4 1,15 * 5" would cause a command to be
            // run at 4:30 am on the  1st and 15th of each month, plus every Friday."
            //
            // http://unixhelp.ed.ac.uk/CGI/man-cgi?crontab+5
            //
            var dayOfMonthMatch = null;
            if (typeof this._fields.dayOfMonth === "string" && this._fields.dayOfMonth === "L")
            {
                dayOfMonthMatch = matchSchedule(currentDate, this._fields.dayOfMonth);
            } else
            {
                dayOfMonthMatch = matchSchedule(currentDate.getDate(), this._fields.dayOfMonth);
            }
            var dayOfWeekMatch = null;
            if (this._isLastDayOfMonth === true)
            {
                dayOfWeekMatch = matchSchedule(currentDate, this._fields.dayOfWeek, true);
            } else
            {
                dayOfWeekMatch = matchSchedule(currentDate.getDay(), this._fields.dayOfWeek);
            }

            var isDayOfMonthWildcardMatch = this.isWildcardRange(this._fields.dayOfMonth, cronConstraints[3]);
            var isDayOfWeekWildcardMatch = this.isWildcardRange(this._fields.dayOfWeek, cronConstraints[5]);

            var currentHour = currentDate.getHours();

            // Add or subtract day if select day not match with month (according to calendar)
            if (!dayOfMonthMatch && !dayOfWeekMatch)
            {
                this._applyTimezoneShift(currentDate, dateMathVerb, 'Day');
                continue;
            }

            // Add or subtract day if not day of month is set (and no match) and day of week is wildcard
            if (!isDayOfMonthWildcardMatch && isDayOfWeekWildcardMatch && !dayOfMonthMatch)
            {
                this._applyTimezoneShift(currentDate, dateMathVerb, 'Day');
                continue;
            }

            // Add or subtract day if not day of week is set (and no match) and day of month is wildcard
            if (isDayOfMonthWildcardMatch && !isDayOfWeekWildcardMatch && !dayOfWeekMatch)
            {
                this._applyTimezoneShift(currentDate, dateMathVerb, 'Day');
                continue;
            }

            // Add or subtract day if day of month and week are non-wildcard values and both doesn't match
            if (!(isDayOfMonthWildcardMatch && isDayOfWeekWildcardMatch) &&
                !dayOfMonthMatch && !dayOfWeekMatch)
            {
                this._applyTimezoneShift(currentDate, dateMathVerb, 'Day');
                continue;
            }

            // Add or subtract day if day of week & nthDayOfWeek are set (and no match)
            if (
                this._nthDayOfWeek > 0 &&
                !isNthDayMatch(currentDate, this._nthDayOfWeek)
            )
            {
                this._applyTimezoneShift(currentDate, dateMathVerb, 'Day');
                continue;
            }

            // Match month
            if (!matchSchedule(currentDate.getMonth() + 1, this._fields.month))
            {
                this._applyTimezoneShift(currentDate, dateMathVerb, 'Month');
                continue;
            }

            // Match day
            if(!matchSchedule(currentDate.getDay(), this._fields.dayOfWeek))
            {
                this._applyTimezoneShift(currentDate, dateMathVerb, 'Day');
                continue;
            }

            // Match hour
            if (!matchSchedule(currentHour, this._fields.hour))
            {
                if (this._dstStart !== currentHour)
                {
                    this._dstStart = null;
                    this._applyTimezoneShift(currentDate, dateMathVerb, 'Hour');
                    continue;
                } else if (!matchSchedule(currentHour - 1, this._fields.hour))
                {
                    currentDate[dateMathVerb + 'Hour']();
                    continue;
                }
            } else if (this._dstEnd === currentHour)
            {
                if (!reverse)
                {
                    this._dstEnd = null;
                    this._applyTimezoneShift(currentDate, 'add', 'Hour');
                    continue;
                }
            }

            // Match minute
            if (!matchSchedule(currentDate.getMinutes(), this._fields.minute))
            {
                this._applyTimezoneShift(currentDate, dateMathVerb, 'Minute');
                continue;
            }

            // Match second
            if (!matchSchedule(currentDate.getSeconds(), this._fields.second))
            {
                this._applyTimezoneShift(currentDate, dateMathVerb, 'Second');
                continue;
            }

            // Increase a second in case in the first iteration the currentDate was not
            // modified
            if (startTimestamp === currentDate.getTime())
            {
                if ((dateMathVerb === 'add') || (currentDate.getMilliseconds() === 0))
                {
                    this._applyTimezoneShift(currentDate, dateMathVerb, 'Second');
                } else
                {
                    currentDate.setMilliseconds(0);
                }

                continue;
            }

            break;
        }

        if (stepCount >= LOOP_LIMIT)
        {
            throw new Error('Invalid expression, loop limit exceeded');
        }

        this._currentDate = new CronDate(currentDate, this._tz);
        this._hasIterated = true;

        return currentDate;
    }

    /**
     * Find next suitable date
     *
     * @public
     * @return {CronDate|Object}
     */
    next()
    {
        var schedule = this._findSchedule();

        // Try to return ES6 compatible iterator
        if (this._isIterator)
        {
            return {
                value: schedule,
                done: !this.hasNext()
            };
        }

        return schedule;
    }

    /**
     * Find previous suitable date
     *
     * @public
     * @return {CronDate|Object}
     */
    prev()
    {
        var schedule = this._findSchedule(true);

        // Try to return ES6 compatible iterator
        if (this._isIterator)
        {
            return {
                value: schedule,
                done: !this.hasPrev()
            };
        }

        return schedule;
    }

    /**
     * Check if next suitable date exists
     *
     * @public
     * @return {Boolean}
     */
    hasNext()
    {
        var current = this._currentDate;
        var hasIterated = this._hasIterated;

        try
        {
            this._findSchedule();
            return true;
        } catch (err)
        {
            return false;
        } finally
        {
            this._currentDate = current;
            this._hasIterated = hasIterated;
        }
    }

    /**
     * Check if previous suitable date exists
     *
     * @public
     * @return {Boolean}
     */
    hasPrev ()
    {
        var current = this._currentDate;
        var hasIterated = this._hasIterated;

        try
        {
            this._findSchedule(true);
            return true;
        } catch (err)
        {
            return false;
        } finally
        {
            this._currentDate = current;
            this._hasIterated = hasIterated;
        }
    }

    /**
     * Iterate over expression iterator
     *
     * @public
     * @param {Number} steps Numbers of steps to iterate
     * @param {Function} callback Optional callback
     * @return {Array} Array of the iterated results
     */
    iterate(steps, callback)
    {
        var dates = [];

        if (steps >= 0)
        {
            for (var i = 0, c = steps; i < c; i++)
            {
                try
                {
                    var item = this.next();
                    dates.push(item);

                    // Fire the callback
                    if (callback)
                    {
                        callback(item, i);
                    }
                } catch (err)
                {
                    break;
                }
            }
        } else
        {
            for (let i = 0, c = steps; i > c; i--)
            {
                try
                {
                    let item = this.prev();
                    dates.push(item);

                    // Fire the callback
                    if (callback)
                    {
                        callback(item, i);
                    }
                } catch (err)
                {
                    break;
                }
            }
        }

        return dates;
    }

    /**
     * Reset expression iterator state
     *
     * @public
     */
    reset()
    {
        this._currentDate = new CronDate(this._options.currentDate);
    }

    /**
     * Parse input expression (async)
     *
     * @public
     * @param {String} expression Input expression
     * @param {Object} [options] Parsing options
     * @param {Function} [callback]
     */

    static parse(expression, options, callback)
    {
        var self = this;
        if (typeof options === 'function')
        {
            callback = options;
            options = {};
        }

        function parse(expression, options)
        {
            if (!options)
            {
                options = {};
            }

            if (typeof options.currentDate === 'undefined')
            {
                options.currentDate = new CronDate(undefined, self._tz);
            }

            // Is input expression predefined?
            if (cronPredefined[expression])
            {
                expression = cronPredefined[expression];
            }

            // Split fields
            var fields = [];
            var atoms = (expression + '').trim().split(/\s+/);

            if (atoms.length > 7)
            {
                throw new Error('Invalid cron expression');
            }
            if (atoms.length === 6)
            {
                atoms[6] = null;
            }

            // Resolve fields
            var start = (cronMap.length - atoms.length);
            for (let i = 0, c = cronMap.length; i < c; ++i)
            {
                var field = cronMap[i]; // Field name
                var value = atoms[atoms.length > c ? i : i - start]; // Field value

                if (i < start || !value)
                { // Use default value
                    fields.push(CronExpression._parseField(
                        field,
                        cronParseDefaults[i],
                        cronConstraints[i],
                        self));
                } else
                {
                    var val = field === 'dayOfWeek' ? parseNthDay(value) : value;

                    fields.push(CronExpression._parseField(
                        field,
                        val,
                        cronConstraints[i],
                        self));
                }
            }

            var mappedFields = {};
            for (let i = 0, c = cronMap.length; i < c; i++)
            {
                var key = cronMap[i];
                mappedFields[key] = fields[i];
            }

            // Filter out any day of month value that is larger than given month expects
            if (mappedFields.month.length === 1 && typeof mappedFields.dayOfMonth !== "string")
            {
                var daysInMonth = cronDaysInMonth[mappedFields.month[0] - 1];

                if (mappedFields.dayOfMonth[0] > daysInMonth)
                {
                    throw new Error('Invalid explicit day of month definition');
                }

                mappedFields.dayOfMonth = mappedFields.dayOfMonth.filter(function (dayOfMonth)
                {
                    return dayOfMonth <= daysInMonth;
                });
            }

            options._isLastDayOfMonth = self._isLastDayOfMonth;
            delete self._isLastDayOfMonth;
            
            return new CronExpression(mappedFields, options);

            /**
             * Parses out the # special character for the dayOfWeek field & adds it to options.
             *
             * @param {String} val
             * @return {String}
             * @private
             */
            function parseNthDay(val)
            {
                var atoms = val.split('#');
                if (atoms.length > 1)
                {
                    var nthValue = +atoms[atoms.length - 1];
                    if (/,/.test(val))
                    {
                        throw new Error('Constraint error, invalid dayOfWeek `#` and `,` ' +
                            'special characters are incompatible');
                    }
                    if (/\//.test(val))
                    {
                        throw new Error('Constraint error, invalid dayOfWeek `#` and `/` ' +
                            'special characters are incompatible');
                    }
                    if (/-/.test(val))
                    {
                        throw new Error('Constraint error, invalid dayOfWeek `#` and `-` ' +
                            'special characters are incompatible');
                    }
                    if (atoms.length > 2 || isNaN(nthValue) || (nthValue < 1 || nthValue > 5))
                    {
                        throw new Error('Constraint error, invalid dayOfWeek occurrence number (#)');
                    }

                    options.nthDayOfWeek = nthValue;
                    return atoms[0];
                }
                return val;
            }
        }

        return parse(expression, options);
    }
}