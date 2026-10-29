const TIME_BUILDER = 'time';

const TIME_DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const TIME_MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function time_parseDate(date) {
    const day = date.getDate();
    let suffix;

    switch (day % 10) {
        case 1:
            suffix = "st";
            break;

        case 2:
            suffix = "nd";
            break;

        case 3:
            suffix = "rd";
            break;

        default:
            suffix = "th";
            break;
    }

    return {
        dayName: TIME_DAY_NAMES[date.getDay()],
        day,
        suffix,
        monthName: TIME_MONTH_NAMES[date.getMonth()]
    };
}

function time_parseTime(date) {
    const hours = date.getHours();
    let hoursPeriod = hours;
    let period = "AM";

    if (hours > 12) {
        hoursPeriod -= 12;
        period = "PM";
    }
    if (hours === 0) {
        hoursPeriod = 12;
        period = "AM";
    }

    let minutes = date.getMinutes();
    if (minutes / 10 < 1) {
        minutes = "0" + minutes;
    }

    return {
        hours,
        hoursPeriod,
        minutes,
        period
    };
}



class TimeWidget extends TabbyWidget {
    /** @type {TimeWidgetConfig} */
    #config;
    
    /** @type {Signal<TimeWidgetConfig>} */
    $configSignal;
    
    /** @type {HTMLElement} */
    #display;
    #interval;
    
    /** @type {Signal<Date>} */
    #clock;



    constructor(config) {
        super();

        this.#config = config;
        this.setConfig(config);
        
        this.$configSignal = signal(config);

        this.#clock = signal(_, { equals: (a, b) => a?.getTime() === b?.getTime() });
        this.#display = this.Display();

        this.#interval = setInterval(() => {
            const date = new Date();
            if (date.getSeconds() !== 0) {
                return;
            }

            const [_, setClock] = this.#clock;
            setClock(date);
        }, 1000);
    }
    
    
    
    Display() {
        const [getConfig] = this.$configSignal;
        const [getClock] = this.#clock;
 
        const [time, setTime] = signal();
        const [date, setDate] = signal();
        
        batch(() => {
            const clock = getClock() ?? new Date();
            
            setTime(time_parseTime(clock));
            setDate(time_parseDate(clock));
        });
        
        return html`
            <div class="w-time">
                <div class="time">
                    <span class="hours">
                        ${() => getConfig().isMilitaryTime
                            ? time().hours
                            : time().hoursPeriod}
                    </span>
                    
                    <span class="minutes">
                        ${() => time().minutes}
                    </span>
                    
                    <${Show} when="${() => getConfig().showPeriod}">
                        ${() => time().period}
                    </>
                </div>
                
                <${Show} when="${() => getConfig().showDate}">
                    <div class="date">
                        <span class="week-day day">
                            ${() => date().dayName}
                        </span>
                        
                        <span class="day">
                            ${() => (x => x.day + x.suffix)(date())}
                        </span>
                        
                        <span class="month">
                            ${() => date().monthName}
                        </span>
                    </div>
                </>
            </div>
        `;
    }

    instantiate() {
        return tabby_WidgetElement(this, this.#display, this.#config);
    }

    inspect() {
        const useUpdateProp = (object, property) => {
            const [get, set] = useProp(object, property);

            return [get, x => {
                const value = set(x);
                this.updateDisplay();
                tabby_save();
                return value;
            }]
        }
        
        return html`
            <${TabbyTitle} title="Time" />
            <${TabbyHR} />
            
            <${TabbyCheckbox} state="${useUpdateProp(this.#config, 'showDate')}" label="Show date" />
            <${TabbyCheckbox} state="${useUpdateProp(this.#config, 'showPeriod')}" label="Show AM/PM" />
            <${TabbyCheckbox} state="${useUpdateProp(this.#config, 'isMilitaryTime')}" label="Show as military time" />
        `;
    }

    save() {
        const ret = {
            ...this.#config,
            ...super.save()
        };

        ret.builder = TIME_BUILDER;

        return ret;
    }
}



const time_builder = new FunctionalTabbyBuilder(
    TIME_BUILDER,
    config => new TimeWidget(config)
);



tabby_addBuilder(time_builder);
tabby_addPrefab(
    tabby_PrefabElement({
        builder: time_builder,
        icon: nf("nf-fa-clock"),
        name: "Time"
    })
);
