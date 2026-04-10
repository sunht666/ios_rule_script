/**
 * file: erplus_permission.js
 * desc: 大管加权限码注入 (拦截 getSomeoneAuthByAccessToken / getEveryoneAuthByAccessTokenServlet)
 * author: Sebastian
 *
 * 注入所有管理员权限码，使前端 isXxxAdmin getter 全部返回 true:
 *   5=通讯录  7=考勤  9=通知  11/12/13/14/17=薪资  15=绩效
 *   41=人事  42=企业文化  43=招聘/考试  80=进销存  91=财务  161=表单
 */

const ALL_CODES = [5, 7, 9, 11, 12, 13, 14, 15, 17, 41, 42, 43, 80, 91, 101, 121, 141, 151, 161];

let body = $response.body;

if (body) {
    try {
        let obj = JSON.parse(body);

        // getSomeoneAuthByAccessToken: { result: "0", item: [...] }
        // getEveryoneAuthByAccessTokenServlet: { item: ... }
        if (obj.item !== undefined) {
            if (Array.isArray(obj.item)) {
                obj.item = [...new Set([...obj.item, ...ALL_CODES])];
            } else {
                obj.item = ALL_CODES;
            }
        }

        $done({ body: JSON.stringify(obj) });
    } catch (e) {
        $done({ body });
    }
} else {
    $done({});
}
