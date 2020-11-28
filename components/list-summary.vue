<template>

    <div class="list-summary space-y-2">

        <div>
            Currently there are <strong>{{ total }} listed</strong>,
            <span>
                <span
                    v-for="percentage in percentages"
                    :key="percentage.emoji"
                    :class="[
                        percentage.textColor
                    ]"
                >{{ percentage.emoji }} <strong>{{ percentage.percent }}%</strong> {{ percentage.verbiage }}</span>
            </span>
        </div>

        <div class="w-full h-2 flex flex-1">
            <div
                v-for="(percentage, index) in nonEmptyPercentages"
                :key="percentage.emoji"
                :style="`width: ${percentage.percent}%;`"
                :class="[
                    percentage.bgColor,
                    (index === 0) ? 'rounded-l-full' : null,
                    (index === nonEmptyPercentages.length - 1) ? 'rounded-r-full' : null
                ]"
            />
        </div>

    </div>

</template>

<script>

import statuses from '~/helpers/statuses'

export default {
    props: {
        appList: {
            type: Array,
            required: true
        }
    },
    data: function () {
        return {
            nativePercent: null,
            rosettaPercent: null,
            unreportedPercent: null,
            unsupportedPercent: null
        }
    },
    computed: {
        total () {
            return this.appList.length
        },
        percentages () {
            return [
                {
                    textColor: 'text-green-500',
                    bgColor: 'bg-green-500',
                    emoji: '✅',
                    percent: this.nativePercent,
                    verbiage: `are natively supported, `
                },
                {
                    textColor: 'text-green-200',
                    bgColor: 'bg-green-200',
                    emoji: '✳️',
                    percent: this.rosettaPercent,
                    verbiage: `run via Rosetta 2, `
                },
                {
                    textColor: 'text-orange-500',
                    bgColor: 'bg-orange-500',
                    emoji: '🔶',
                    percent: this.unreportedPercent,
                    verbiage: `are not yet reported, `
                },
                {
                    textColor: 'text-red',
                    bgColor: 'bg-red',
                    emoji: '🚫',
                    percent: this.unsupportedPercent,
                    verbiage: `are not working. `
                },
            ]
        },
        nonEmptyPercentages () {
            return this.percentages.filter(percentage => {
                return Number(percentage.percent) !== 0
            })
        }
    },
    created () {
        // console.log('total apps ', this.total)

        // Create a totals object to collect amounts
        const totals = {}

        // Get status slugs from statuses
        Object.entries(statuses).forEach( ([_, statusSlug]) => {
            totals[statusSlug] = 0
        })

        // Count uses of each status
        this.appList.forEach( app => {
            // console.log('app.status', app.status)

            for (const statusKey in statuses) {
                if (app.status === statuses[statusKey]) {
                    totals[app.status]++
                    break
                }
            }

        })

        // console.log('totals', totals)

        this.nativePercent = Number((( totals['native'] / this.total ) * 100).toFixed(1))
        this.rosettaPercent = Number((( totals['rosetta'] / this.total ) * 100).toFixed(1))
        this.unreportedPercent = Number((( totals['unreported'] / this.total ) * 100).toFixed(1))

        this.unsupportedPercent = Number((100 - (this.nativePercent + this.rosettaPercent + this.unreportedPercent)).toFixed(1))

        // console.log('this.nativePercent', this.nativePercent)
        // console.log('this.unsupportedPercent', this.unsupportedPercent)

    }
}

</script>
