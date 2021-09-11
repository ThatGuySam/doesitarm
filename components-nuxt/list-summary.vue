<template>

    <div class="list-summary space-y-2">

        <div>
            <strong>{{ total }} listed</strong>,
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

import getListSummaryNumbers from '~/helpers/get-list-summary-numbers.js'

export default {
    props: {
        appList: {
            type: Array,
            default: null
        },
        customNumbers: {
            type: Object,
            default: () => {
                return {
                    total: null,
                    nativePercent: null,
                    rosettaPercent: null,
                    unreportedPercent: null,
                    unsupportedPercent: null
                }
            }
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
            return (this.customNumbers.total) ? this.customNumbers.total : this.appList.length
        },
        percentages () {
            return [
                {
                    textColor: 'text-green-500',
                    bgColor: 'bg-green-500',
                    emoji: '✅',
                    percent: this.nativePercent,
                    verbiage: `Native, `
                },
                {
                    textColor: 'text-green-200',
                    bgColor: 'bg-green-200',
                    emoji: '✳️',
                    percent: this.rosettaPercent,
                    verbiage: `Rosetta, `
                },
                {
                    textColor: 'text-orange-500',
                    bgColor: 'bg-orange-500',
                    emoji: '🔶',
                    percent: this.unreportedPercent,
                    verbiage: `need info, `
                },
                {
                    textColor: 'text-red',
                    bgColor: 'bg-red',
                    emoji: '🚫',
                    percent: this.unsupportedPercent,
                    verbiage: `unsupported. `
                },
            ].filter( percentage => {
                const isZero = (percentage.percent === 0)
                const isUnreported = (percentage.emoji === '🔶')

                // Filter out
                if (isUnreported && isZero) return false

                return true
            })
        },
        nonEmptyPercentages () {
            return this.percentages.filter(percentage => {
                return Number(percentage.percent) !== 0
            })
        }
    },
    created () {
        // console.log('total apps ', this.total)

        const hasCustomNumbers = Object.entries(this.customNumbers).some(([key, number]) => number !== null)

        if (hasCustomNumbers) {

            this.nativePercent = this.customNumbers.nativePercent
            this.rosettaPercent = this.customNumbers.rosettaPercent
            this.unreportedPercent = this.customNumbers.unreportedPercent
            this.unsupportedPercent = this.customNumbers.unsupportedPercent

            return
        }

        const summaryNumbers = getListSummaryNumbers(this.appList)

        this.nativePercent = summaryNumbers.nativePercent
        this.rosettaPercent = summaryNumbers.rosettaPercent
        this.unreportedPercent = summaryNumbers.unreportedPercent
        this.unsupportedPercent = summaryNumbers.unsupportedPercent

        // console.log('this.nativePercent', this.nativePercent)
        // console.log('this.unsupportedPercent', this.unsupportedPercent)

    }
}

</script>
