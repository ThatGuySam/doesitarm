export function byTimeThenNull (appA, appB) {
    // console.log('appA.lastUpdated', appA.lastUpdated)

    // equal items sort equally
    if (appA.lastUpdated === appB.lastUpdated) {
        return 0;
    }
    // nulls sort after anything else
    else if (appA.lastUpdated === null) {
        return 1;
    }
    else if (appB.lastUpdated === null) {
        return -1;
    }

    return appB.lastUpdated.timestamp - appA.lastUpdated.timestamp
}

export default function (appList) {
    return  appList.sort(byTimeThenNull)
}
