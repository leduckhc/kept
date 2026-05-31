# How Spam is handled in Spark

**Source:** https://sparkmailapp.com/help/manage-your-inbox/how-spam-is-handled-in-spark

---

Handling spam is an increasingly present part of the email delivery process. To find out what spam is and how it is being detected and blocked, follow the article.

Jump to:

* [What are spam and spam filters?](#what)
* [How does Spark handle spam?](#how)
* [How to solve spam not being filtered properly?](#solve)

## What are spam and spam filters?

Spam (or junk) mail is unwanted, irrelevant, usually commercial advertising or promotional material sent to a large number of recipients via email without their request.

Every email provider has dedicated filters to protect users from spam and abuse, but not all spam filters function the same way. Generally, spam filters use special algorithms to analyze an incoming email with multiple criteria to consider, including its similarity with emails you’d manually marked as spam earlier, common trigger words, content and design of the email, and so on. Then, the filters determine if the email will pass through and reach your inbox or stay in the spam folder.

## How does Spark handle spam?

Currently, our app doesn’t have its own spam filters. While handling spam, Spark relies on the spam filter of your email provider. So if your email provider considers an email as spam, so will Spark.

For instance, if you use a Gmail account, the spam is managed by Gmail algorithms and on Gmail servers. If you use iCloud, it’s on iCloud’s technologies to detect and block junk mail. Spark syncs with your email provider server, but doesn’t affect the spam filters.

## How to resolve the issue of spam not being filtered properly?

If your server doesn’t detect junk mail properly, we recommend creating your own spam filters. This can be usually done on the website of your email provider or in a dedicated app if there is any. For example, [here](http://www.wikihow.com/Create-a-Filter-in-Gmail) is how to create a filter in Gmail.