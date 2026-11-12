import { test,expect } from '@playwright/test'
test('brief to investigation, decision, time travel and score',async({page})=>{
  await page.goto('/')
  if(await page.getByRole('heading',{name:'Workspace sign in'}).isVisible({timeout:3000}).catch(()=>false)){
    await page.getByLabel('Access token',{exact:true}).fill('e2e-admin-token-for-isolated-tests-only')
    await page.getByRole('button',{name:'Sign in',exact:true}).click()
  }
  await expect(page.getByRole('heading',{name:'Bản tin sáng'})).toBeVisible({timeout:30000})
  await page.getByRole('link',{name:/Xem AI điều tra/}).click()
  await expect(page.getByText('Mức tin cậy:').first()).toBeVisible({timeout:20000})
  await page.getByRole('button',{name:'Chọn'}).nth(1).click()
  await page.getByRole('button',{name:'Tua 7 ngày'}).click()
  await page.getByRole('button',{name:'Tua 7 ngày'}).click()
  await expect(page.getByText(/AI đoán (đúng|sai)/)).toBeVisible({timeout:20000})
  await page.getByRole('button',{name:'Đặt lại'}).click()
})
